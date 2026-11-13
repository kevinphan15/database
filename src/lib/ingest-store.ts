/** Ghi observation vào D1: idempotency + luật A + batch nguyên tử. */

import { resetDataCache } from './data';
import {
  contentHashOf,
  decideIngest,
  drawKey,
  type DrawState,
  type Observation,
  type RevisionRef,
} from './ingest';
import type { DrawStatus } from './types';

export interface ProcessResult {
  status: number;
  body: Record<string, unknown>;
}

interface EventRow {
  request_hash: string;
  result_code: number;
}

interface DrawRow {
  status: DrawStatus;
  confirmed_revision_id: number | null;
  rev: number;
}

async function findReplay(
  db: D1Database,
  idemKey: string,
  requestHash: string,
  drawKeyValue: string,
): Promise<ProcessResult | null> {
  const existing = await db
    .prepare('SELECT request_hash, result_code FROM ingest_events WHERE idem_key = ?1')
    .bind(idemKey)
    .first<EventRow>();
  if (!existing) return null;
  return existing.request_hash === requestHash
    ? {
        status: 200,
        body: { ok: true, action: 'duplicate', replayed_status: existing.result_code, draw_key: drawKeyValue },
      }
    : {
        status: 409,
        body: {
          ok: false,
          error: 'idempotency_conflict',
          detail: 'Idempotency-Key đã dùng với payload khác.',
          draw_key: drawKeyValue,
        },
      };
}

export async function processObservation(
  db: D1Database,
  params: { observation: Observation; idemKey: string; requestHash: string },
): Promise<ProcessResult> {
  const { observation, idemKey, requestHash } = params;
  const key = drawKey(observation);

  const replay = await findReplay(db, idemKey, requestHash, key);
  if (replay) return replay;

  const settings = await db
    .prepare("SELECT value FROM settings WHERE key = 'publish_enabled'")
    .first<{ value: string }>();
  if (settings?.value === '0') {
    return {
      status: 423,
      body: { ok: false, error: 'publish_disabled', detail: 'Xuất bản đang tắt; ingest bị từ chối.' },
    };
  }

  const station = await db
    .prepare('SELECT station_code FROM stations WHERE station_code = ?1')
    .bind(observation.station_code)
    .first<{ station_code: string }>();
  if (!station) return { status: 422, body: { ok: false, error: 'unknown_station' } };

  const source = await db
    .prepare('SELECT is_authoritative FROM sources WHERE source_id = ?1')
    .bind(observation.source_id)
    .first<{ is_authoritative: number }>();
  if (!source) return { status: 422, body: { ok: false, error: 'unknown_source' } };

  const current = await db
    .prepare('SELECT status, confirmed_revision_id, rev FROM draws WHERE draw_key = ?1')
    .bind(key)
    .first<DrawRow>();

  const revisions = await db
    .prepare(
      'SELECT id, kind, source_id, content_hash, observed_at FROM result_revisions WHERE draw_key = ?1 ORDER BY id',
    )
    .bind(key)
    .all<RevisionRef>();

  const contentHash = await contentHashOf(observation.prizes);
  const decision = decideIngest({
    observation,
    contentHash,
    sourceAuthoritative: source.is_authoritative === 1,
    current: current
      ? { status: current.status, confirmed_revision_id: current.confirmed_revision_id, rev: current.rev }
      : null,
    revisions: revisions.results ?? [],
  });

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  // 1) Sổ idempotency — khoá chính chặn request trùng.
  statements.push(
    db
      .prepare(
        'INSERT INTO ingest_events (idem_key, request_hash, result_code, draw_key, created_at) VALUES (?1, ?2, ?3, ?4, ?5)',
      )
      .bind(idemKey, requestHash, decision.httpStatus, key, now),
  );

  // 2) Tạo kỳ nếu chưa có (không ghi đè trạng thái của bản đang có).
  statements.push(
    db
      .prepare(
        `INSERT INTO draws (draw_key, station_code, product_code, draw_date, period_code, status, confirmed_revision_id, rev, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'scheduled', NULL, 0, ?6)
         ON CONFLICT(draw_key) DO NOTHING`,
      )
      .bind(key, observation.station_code, observation.product_code, observation.draw_date, observation.period_code ?? null, now),
  );

  // 3) Revision append-only (trùng hash thì bỏ qua, không ghi đè lịch sử).
  if (decision.action !== 'unchanged') {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO result_revisions
             (draw_key, kind, source_id, observed_at, source_updated_at, content_hash, prizes_json,
              prize_rule_version, is_correction, confirmed_by, note, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        )
        .bind(
          key,
          observation.kind,
          observation.source_id,
          observation.observed_at,
          observation.source_updated_at ?? null,
          contentHash,
          JSON.stringify(observation.prizes),
          observation.prize_rule_version ?? 1,
          decision.isCorrection ? 1 : 0,
          decision.confirmedBy,
          decision.reason,
          now,
        ),
    );
  }

  // 4) Trạng thái kỳ. Guard `rev` phải nằm TRONG batch: câu INSERT…SELECT dưới đây chỉ chọn
  //    dòng khi `rev` đã khác lúc đọc, nên nếu có ghi chen vào nó đụng PRIMARY KEY của draws và
  //    làm cả batch ROLLBACK — không bao giờ trả lỗi sau khi dữ liệu đã commit.
  if (decision.status) {
    const baseRev = current?.rev ?? 0;
    statements.push(
      db
        .prepare(
          `INSERT INTO draws (draw_key, station_code, product_code, draw_date, status, rev, updated_at)
           SELECT draw_key, station_code, product_code, draw_date, status, rev, updated_at
             FROM draws WHERE draw_key = ?1 AND rev <> ?2`,
        )
        .bind(key, baseRev),
    );
    if (decision.confirmedHash) {
      statements.push(
        db
          .prepare(
            `UPDATE draws
                SET status = ?2,
                    confirmed_revision_id = (SELECT id FROM result_revisions
                                              WHERE draw_key = ?1 AND kind = 'final' AND content_hash = ?3
                                              ORDER BY id LIMIT 1),
                    rev = rev + 1,
                    updated_at = ?4
              WHERE draw_key = ?1 AND rev = ?5`,
          )
          .bind(key, decision.status, decision.confirmedHash, now, baseRev),
      );
      statements.push(
        db
          .prepare(
            'UPDATE result_revisions SET confirmed_by = ?3 WHERE draw_key = ?1 AND content_hash = ?2 AND confirmed_by IS NULL',
          )
          .bind(key, decision.confirmedHash, decision.confirmedBy ?? 'auto'),
      );
    } else {
      statements.push(
        db
          .prepare(
            'UPDATE draws SET status = ?2, rev = rev + 1, updated_at = ?3 WHERE draw_key = ?1 AND rev = ?4',
          )
          .bind(key, decision.status, now, baseRev),
      );
    }
  }

  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE|constraint/i.test(message)) {
      // Trùng Idempotency-Key → trả lại kết quả cũ.
      const replay = await findReplay(db, idemKey, requestHash, key);
      if (replay) return replay;
      // Không có event của mình ⇒ lỗi đến từ guard `rev`; batch đã rollback sạch nên gửi lại
      // với CÙNG Idempotency-Key là an toàn.
      return {
        status: 409,
        body: {
          ok: false,
          error: 'concurrent_write',
          detail: 'Kỳ vừa bị request khác thay đổi; chưa ghi gì, gửi lại với cùng Idempotency-Key.',
          draw_key: key,
        },
      };
    }
    throw error;
  }

  resetDataCache();

  return {
    status: decision.httpStatus,
    body: {
      ok: true,
      action: decision.action,
      draw_key: key,
      status: decision.status ?? current?.status ?? 'scheduled',
      reason: decision.reason,
    },
  };
}

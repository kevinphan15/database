/**
 * Test lớp ghi D1 của ingest bằng SQLite thật (node:sqlite) thay cho D1 local.
 * Hai lỗi được khoá lại ở đây:
 *  1. retry với `observed_at` mới phải là 200 duplicate, không phải 409;
 *  2. guard `rev` phải rollback cả batch, không trả 409 sau khi đã ghi.
 */

import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { requestHashOf, type Observation } from '../src/lib/ingest';
import { processObservation } from '../src/lib/ingest-store';

class Stmt {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): Stmt {
    return new Stmt(this.db, this.sql, params);
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[])) as T | undefined;
    return row ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...(this.params as never[])) as T[] };
  }

  run(): { success: true; meta: { changes: number } } {
    const result = this.db.prepare(this.sql).run(...(this.params as never[]));
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

/** D1 giả: mỗi batch chạy trong một transaction, rollback khi có lỗi. */
class FakeDb {
  readonly raw = new DatabaseSync(':memory:');
  /** Chạy một lệnh "từ tiến trình khác" ngay trước khi batch bắt đầu. */
  beforeBatch: (() => void) | null = null;

  prepare(sql: string): Stmt {
    return new Stmt(this.raw, sql);
  }

  async batch(statements: Stmt[]): Promise<{ success: true; meta: { changes: number } }[]> {
    if (this.beforeBatch) {
      this.beforeBatch();
      this.beforeBatch = null;
    }
    this.raw.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.run());
      this.raw.exec('COMMIT');
      return results;
    } catch (error) {
      this.raw.exec('ROLLBACK');
      throw error;
    }
  }

  scalar(sql: string): number {
    const row = this.raw.prepare(sql).get() as { n: number } | undefined;
    return Number(row?.n ?? 0);
  }

  text(sql: string): string | null {
    const row = this.raw.prepare(sql).get() as { v: string | null } | undefined;
    return row?.v ?? null;
  }
}

const SCHEMA = `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE stations (
  station_code TEXT PRIMARY KEY, region_code TEXT, slug TEXT, name TEXT,
  status TEXT NOT NULL DEFAULT 'active', redistribution_allowed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sources (
  source_id TEXT PRIMARY KEY, name TEXT, kind TEXT, is_authoritative INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draw_key TEXT NOT NULL UNIQUE, station_code TEXT NOT NULL, product_code TEXT NOT NULL,
  draw_date TEXT NOT NULL, period_code TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled', confirmed_revision_id INTEGER,
  rev INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
  UNIQUE (station_code, product_code, draw_date)
);
CREATE TABLE result_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, draw_key TEXT NOT NULL, kind TEXT NOT NULL,
  source_id TEXT NOT NULL, observed_at TEXT NOT NULL, source_updated_at TEXT,
  content_hash TEXT NOT NULL, prizes_json TEXT NOT NULL, prize_rule_version INTEGER NOT NULL,
  is_correction INTEGER NOT NULL DEFAULT 0, confirmed_by TEXT, note TEXT,
  created_at TEXT NOT NULL, UNIQUE (draw_key, kind, content_hash)
);
CREATE TABLE ingest_events (
  idem_key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, result_code INTEGER NOT NULL,
  draw_key TEXT, created_at TEXT NOT NULL
);
`;

const KEY = 'DONG_NAI:xs-mn:2026-11-18';

function makeDb(): FakeDb {
  const db = new FakeDb();
  db.raw.exec(SCHEMA);
  db.raw.exec(`INSERT INTO settings (key, value) VALUES ('publish_enabled', '1')`);
  db.raw.exec(`INSERT INTO stations (station_code, region_code, slug, name) VALUES ('DONG_NAI', 'MN', 'dong-nai', 'Đồng Nai')`);
  db.raw.exec(`INSERT INTO sources (source_id, name, kind, is_authoritative) VALUES
    ('src-official', 'Nguồn chính thức', 'official', 1),
    ('src-backup', 'Nguồn dự phòng', 'scrape', 0)`);
  return db;
}

function obs(over: Partial<Observation> = {}): Observation {
  return {
    station_code: 'DONG_NAI',
    product_code: 'xs-mn',
    draw_date: '2026-11-18',
    kind: 'final',
    source_id: 'src-official',
    prizes: { special: ['001234'], seventh: ['007'] },
    observed_at: '2026-11-18T09:45:00Z',
    ...over,
  };
}

async function ingest(db: FakeDb, observation: Observation, idemKey: string) {
  return processObservation(db as unknown as D1Database, {
    observation,
    idemKey,
    requestHash: await requestHashOf(observation),
  });
}

describe('idempotency — retry với timestamp mới', () => {
  let db: FakeDb;

  beforeEach(() => {
    db = makeDb();
  });

  it('trả 200 duplicate, không phải 409, khi observed_at đổi', async () => {
    const first = await ingest(db, obs({ observed_at: '2026-11-18T09:45:00Z' }), 'idem-retry-0001');
    expect(first.status).toBe(201);
    expect(first.body.action).toBe('confirm');

    const retry = await ingest(
      db,
      obs({ observed_at: '2026-11-18T09:52:00Z', source_updated_at: '2026-11-18T09:51:00Z' }),
      'idem-retry-0001',
    );

    expect(retry.status).toBe(200);
    expect(retry.body.action).toBe('duplicate');
    expect(retry.body.replayed_status).toBe(201);

    // Retry không được tạo thêm revision hay event.
    expect(db.scalar('SELECT COUNT(*) AS n FROM result_revisions')).toBe(1);
    expect(db.scalar('SELECT COUNT(*) AS n FROM ingest_events')).toBe(1);
    expect(db.scalar(`SELECT rev AS n FROM draws WHERE draw_key = '${KEY}'`)).toBe(1);
  });

  it('vẫn 409 khi cùng key nhưng nội dung số khác', async () => {
    await ingest(db, obs(), 'idem-conflict-0001');
    const conflict = await ingest(
      db,
      obs({ prizes: { special: ['999999'], seventh: ['007'] } }),
      'idem-conflict-0001',
    );

    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe('idempotency_conflict');
    expect(db.scalar('SELECT COUNT(*) AS n FROM result_revisions')).toBe(1);
  });
});

describe('guard rev — rollback trong batch', () => {
  let db: FakeDb;

  beforeEach(() => {
    db = makeDb();
  });

  it('trả 409 concurrent_write và không để lại ghi dở dang', async () => {
    const first = await ingest(db, obs(), 'idem-first-0001');
    expect(first.status).toBe(201);
    expect(db.scalar(`SELECT confirmed_revision_id AS n FROM draws WHERE draw_key = '${KEY}'`)).toBe(1);

    // Mô phỏng request khác chen vào giữa lúc đọc và lúc ghi batch.
    db.beforeBatch = () => {
      db.raw.exec(`UPDATE draws SET rev = rev + 5, status = 'confirmed' WHERE draw_key = '${KEY}'`);
    };

    const concurrent = await ingest(
      db,
      obs({ prizes: { special: ['007777'], seventh: ['007'] } }),
      'idem-second-0001',
    );

    expect(concurrent.status).toBe(409);
    expect(concurrent.body.error).toBe('concurrent_write');

    // Cả batch đã rollback: không có event/revision mới, rev chỉ tăng do "request khác".
    expect(db.scalar(`SELECT COUNT(*) AS n FROM ingest_events WHERE idem_key = 'idem-second-0001'`)).toBe(0);
    expect(db.scalar(`SELECT COUNT(*) AS n FROM result_revisions WHERE draw_key = '${KEY}'`)).toBe(1);
    expect(db.scalar(`SELECT rev AS n FROM draws WHERE draw_key = '${KEY}'`)).toBe(6);
    expect(db.scalar(`SELECT confirmed_revision_id AS n FROM draws WHERE draw_key = '${KEY}'`)).toBe(1);
  });

  it('gửi lại cùng Idempotency-Key sau 409 thì ghi được (trạng thái còn sạch)', async () => {
    await ingest(db, obs(), 'idem-first-0002');
    db.beforeBatch = () => {
      db.raw.exec(`UPDATE draws SET rev = rev + 5 WHERE draw_key = '${KEY}'`);
    };
    const blocked = await ingest(
      db,
      obs({ prizes: { special: ['007777'], seventh: ['007'] } }),
      'idem-retry-0002',
    );
    expect(blocked.status).toBe(409);

    const retry = await ingest(
      db,
      obs({ prizes: { special: ['007777'], seventh: ['007'] }, observed_at: '2026-11-18T10:20:00Z' }),
      'idem-retry-0002',
    );

    expect(retry.status).toBe(201);
    expect(retry.body.action).toBe('correction');
    expect(db.scalar(`SELECT COUNT(*) AS n FROM result_revisions WHERE draw_key = '${KEY}'`)).toBe(2);
    expect(db.scalar(`SELECT is_correction AS n FROM result_revisions WHERE draw_key = '${KEY}' AND is_correction = 1`)).toBe(1);
    expect(db.scalar(`SELECT rev AS n FROM draws WHERE draw_key = '${KEY}'`)).toBe(7);
    expect(db.scalar(`SELECT COUNT(*) AS n FROM ingest_events WHERE idem_key = 'idem-retry-0002'`)).toBe(1);
  });
});

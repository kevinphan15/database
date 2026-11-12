/** Truy vấn D1 — chỉ đọc bản đã xác nhận (hoặc bản mới nhất nếu chưa xác nhận). */

import type { Dataset, Draw, DrawStatus } from './types';

interface DrawRow {
  draw_key: string;
  station_code: string;
  product_code: string;
  draw_date: string;
  period_code: string | null;
  status: string;
  updated_at: string;
  prizes_json: string | null;
  prize_rule_version: number | null;
  is_correction: number | null;
}

export async function loadFromD1(db: D1Database): Promise<Dataset> {
  const regions = await db
    .prepare('SELECT code, name, slug FROM regions ORDER BY code')
    .all<{ code: string; name: string; slug: string }>();

  const stations = await db
    .prepare(
      `SELECT station_code, region_code, slug, name, short_name, status, redistribution_allowed
       FROM stations WHERE status = 'active' ORDER BY name`,
    )
    .all<{
      station_code: string;
      region_code: string;
      slug: string;
      name: string;
      short_name: string | null;
      status: string;
      redistribution_allowed: number;
    }>();

  const rules = await db
    .prepare(
      'SELECT version, prize_code, label, ordinal, count, digits FROM prize_rules ORDER BY version, ordinal',
    )
    .all<Dataset['prize_rules'][number]>();

  const schedule = await db
    .prepare(
      `SELECT station_code, product_code, iso_weekday, local_time, from_date, to_date
       FROM schedule_rules ORDER BY station_code, iso_weekday`,
    )
    .all<Dataset['schedule'][number]>();

  const exceptions = await db
    .prepare(
      `SELECT station_code, product_code, exception_date, action, new_date, new_time
       FROM schedule_exceptions`,
    )
    .all<Dataset['exceptions'][number]>();

  // Bản hiển thị: revision đã xác nhận nếu có, ngược lại là revision mới nhất.
  const draws = await db
    .prepare(
      `SELECT d.draw_key, d.station_code, d.product_code, d.draw_date, d.period_code,
              d.status, d.updated_at,
              r.prizes_json, r.prize_rule_version, r.is_correction
       FROM draws d
       LEFT JOIN result_revisions r
         ON r.id = COALESCE(
              d.confirmed_revision_id,
              (SELECT MAX(x.id) FROM result_revisions x WHERE x.draw_key = d.draw_key)
            )
       ORDER BY d.draw_date DESC`,
    )
    .all<DrawRow>();

  const settings = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const settingMap = new Map((settings.results ?? []).map((s) => [s.key, s.value]));

  const mapped: Draw[] = (draws.results ?? []).map((row) => ({
    draw_key: row.draw_key,
    station_code: row.station_code,
    product_code: row.product_code,
    draw_date: row.draw_date,
    period_code: row.period_code,
    status: row.status as DrawStatus,
    prize_rule_version: row.prize_rule_version ?? 1,
    updated_at: row.updated_at,
    is_correction: row.is_correction === 1,
    prizes: parsePrizesJson(row.prizes_json),
  }));

  return {
    notice: settingMap.get('data_mode') === 'fixture' ? 'DỮ LIỆU MẪU từ D1 local.' : '',
    is_fixture: settingMap.get('data_mode') === 'fixture',
    product_code: 'xs-mn',
    prize_rule_version: Number(settingMap.get('schema_version') ?? 1),
    regions: regions.results ?? [],
    stations: (stations.results ?? []).map((s) => ({ ...s, redistribution_allowed: s.redistribution_allowed ?? 0 })),
    prize_rules: rules.results ?? [],
    schedule: schedule.results ?? [],
    exceptions: exceptions.results ?? [],
    draws: mapped,
  };
}

function parsePrizesJson(value: string | null): Record<string, string[]> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [code, numbers] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(numbers)) {
        // Giữ nguyên dạng chuỗi: số 0 ở đầu không được mất.
        out[code] = numbers.map((n) => String(n));
      }
    }
    return out;
  } catch {
    return {};
  }
}

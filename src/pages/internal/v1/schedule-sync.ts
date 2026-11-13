import type { APIRoute } from 'astro';
import { resetDataCache } from '../../../lib/data';
import { jsonResponse, readJsonBody } from '../../../lib/http';
import { guardInternal } from '../../../lib/internal-route';
import { parseScheduleSync } from '../../../lib/schedule-sync';

async function knownCodes(db: D1Database, column: string, table: string): Promise<Set<string>> {
  const rows = await db
    .prepare(`SELECT ${column} AS code FROM ${table}`)
    .all<{ code: string }>();
  return new Set((rows.results ?? []).map((row) => row.code));
}

export const POST: APIRoute = async ({ request }) => {
  const guard = await guardInternal(request, 'ingest');
  if (!guard.ok) return guard.response;
  const db = guard.db;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = parseScheduleSync(body.value);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'invalid_payload', errors: parsed.errors }, 422);
  }

  const { rules, exceptions } = parsed.value;

  // Kiểm tra cả lô trước khi ghi, bằng 2 truy vấn (không phụ thuộc số dòng).
  const [stations, products] = await Promise.all([
    knownCodes(db, 'station_code', 'stations'),
    knownCodes(db, 'product_code', 'products'),
  ]);
  const unknown = [...new Set(rules.concat(exceptions).flatMap((row) => [row.station_code, row.product_code]))]
    .filter((code) => !stations.has(code) && !products.has(code));
  if (unknown.length > 0) {
    return jsonResponse({ ok: false, error: 'unknown_station_or_product', codes: unknown }, 422);
  }

  const statements: D1PreparedStatement[] = [];

  for (const rule of rules) {
    statements.push(
      db
        .prepare(
          `INSERT INTO schedule_rules (station_code, product_code, iso_weekday, local_time, from_date, to_date, source_id)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(station_code, product_code, iso_weekday, from_date)
           DO UPDATE SET local_time = excluded.local_time, to_date = excluded.to_date, source_id = excluded.source_id`,
        )
        .bind(rule.station_code, rule.product_code, rule.iso_weekday, rule.local_time, rule.from_date, rule.to_date ?? null, rule.source_id ?? null),
    );
  }

  for (const exception of exceptions) {
    statements.push(
      db
        .prepare(
          `INSERT INTO schedule_exceptions (station_code, product_code, exception_date, action, new_date, new_time, source_id)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(station_code, product_code, exception_date)
           DO UPDATE SET action = excluded.action, new_date = excluded.new_date, new_time = excluded.new_time, source_id = excluded.source_id`,
        )
        .bind(exception.station_code, exception.product_code, exception.exception_date, exception.action, exception.new_date ?? null, exception.new_time ?? null, exception.source_id ?? null),
    );
  }

  const results = await db.batch(statements);
  resetDataCache();

  return jsonResponse({
    ok: true,
    rules_applied: rules.length,
    exceptions_applied: exceptions.length,
    rows_changed: results.reduce((sum, result) => sum + (result.meta?.changes ?? 0), 0),
  });
};

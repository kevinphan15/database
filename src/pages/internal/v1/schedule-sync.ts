import type { APIRoute } from 'astro';
import { authorize } from '../../../lib/auth';
import { resetDataCache } from '../../../lib/data';
import { getEnv } from '../../../lib/env';
import { jsonResponse, readJsonBody } from '../../../lib/http';
import { parseScheduleSync } from '../../../lib/schedule-sync';

export const POST: APIRoute = async ({ request }) => {
  const env = await getEnv();
  const auth = await authorize(request, {
    ingestToken: env.INGEST_TOKEN,
    operatorToken: env.OPERATOR_TOKEN,
    require: 'ingest',
  });
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  if (!env.DB) return jsonResponse({ ok: false, error: 'database_unavailable' }, 503);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = parseScheduleSync(body.value);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'invalid_payload', errors: parsed.errors }, 422);
  }

  const { rules, exceptions } = parsed.value;

  // Kiểm tra cả lô trước khi ghi: đài/sản phẩm phải tồn tại.
  const codes = new Set<string>();
  for (const row of [...rules, ...exceptions]) codes.add(row.station_code);
  for (const row of [...rules, ...exceptions]) codes.add(row.product_code);

  const unknown: string[] = [];
  for (const code of codes) {
    const station = await env.DB.prepare('SELECT 1 AS hit FROM stations WHERE station_code = ?1')
      .bind(code)
      .first<{ hit: number }>();
    const product = station
      ? null
      : await env.DB.prepare('SELECT 1 AS hit FROM products WHERE product_code = ?1')
          .bind(code)
          .first<{ hit: number }>();
    if (!station && !product) unknown.push(code);
  }
  if (unknown.length > 0) {
    return jsonResponse(
      { ok: false, error: 'unknown_station_or_product', codes: unknown },
      422,
    );
  }

  const statements: D1PreparedStatement[] = [];
  for (const rule of rules) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO schedule_rules (station_code, product_code, iso_weekday, local_time, from_date, to_date, source_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(station_code, product_code, iso_weekday, from_date)
         DO UPDATE SET local_time = excluded.local_time, to_date = excluded.to_date, source_id = excluded.source_id`,
      ).bind(
        rule.station_code,
        rule.product_code,
        rule.iso_weekday,
        rule.local_time,
        rule.from_date,
        rule.to_date ?? null,
        rule.source_id ?? null,
      ),
    );
  }
  for (const exception of exceptions) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO schedule_exceptions (station_code, product_code, exception_date, action, new_date, new_time, source_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(station_code, product_code, exception_date)
         DO UPDATE SET action = excluded.action, new_date = excluded.new_date, new_time = excluded.new_time, source_id = excluded.source_id`,
      ).bind(
        exception.station_code,
        exception.product_code,
        exception.exception_date,
        exception.action,
        exception.new_date ?? null,
        exception.new_time ?? null,
        exception.source_id ?? null,
      ),
    );
  }

  const results = await env.DB.batch(statements);
  const changed = results.reduce((sum, result) => sum + (result.meta?.changes ?? 0), 0);
  resetDataCache();

  return jsonResponse({
    ok: true,
    rules_applied: rules.length,
    exceptions_applied: exceptions.length,
    rows_changed: changed,
  });
};

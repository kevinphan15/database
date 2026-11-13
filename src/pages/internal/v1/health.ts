import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/http';
import { guardInternal } from '../../../lib/internal-route';
import { todayInVN } from '../../../lib/time';

interface HealthRow {
  station_code: string;
  name: string;
  last_confirmed_date: string | null;
  last_draw_date: string | null;
  pending: number;
  disputed: number;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export const GET: APIRoute = async ({ request }) => {
  const guard = await guardInternal(request, 'operator');
  if (!guard.ok) return guard.response;
  const db = guard.db;

  const publish = await db
    .prepare("SELECT value FROM settings WHERE key = 'publish_enabled'")
    .first<{ value: string }>();

  const rows = await db
    .prepare(
      `SELECT s.station_code,
              s.name,
              MAX(CASE WHEN d.status = 'confirmed' THEN d.draw_date END) AS last_confirmed_date,
              MAX(d.draw_date) AS last_draw_date,
              SUM(CASE WHEN d.status = 'pending_confirmation' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN d.status = 'disputed' THEN 1 ELSE 0 END) AS disputed
         FROM stations s
         LEFT JOIN draws d ON d.station_code = s.station_code
        WHERE s.status = 'active'
        GROUP BY s.station_code, s.name
        ORDER BY s.name`,
    )
    .all<HealthRow>();

  const today = todayInVN();
  const stations = (rows.results ?? []).map((row) => ({
    station_code: row.station_code,
    name: row.name,
    last_confirmed_date: row.last_confirmed_date ?? null,
    last_draw_date: row.last_draw_date ?? null,
    lag_days: row.last_confirmed_date ? daysBetween(row.last_confirmed_date, today) : null,
    pending: row.pending ?? 0,
    disputed: row.disputed ?? 0,
  }));

  return jsonResponse({
    ok: true,
    publish_enabled: publish?.value !== '0',
    today,
    checked_at: new Date().toISOString(),
    stale: stations.filter((row) => row.lag_days === null || row.lag_days > 2),
    stations,
  });
};

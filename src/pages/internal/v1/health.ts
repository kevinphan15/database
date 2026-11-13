import type { APIRoute } from 'astro';
import { buildHealthReport, type HealthRow } from '../../../lib/health';
import { jsonResponse } from '../../../lib/http';
import { guardInternal } from '../../../lib/internal-route';
import { todayInVN } from '../../../lib/time';

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

  return jsonResponse(
    buildHealthReport(rows.results ?? [], {
      publishEnabled: publish?.value !== '0',
      today: todayInVN(),
      checkedAt: new Date().toISOString(),
    }),
  );
};

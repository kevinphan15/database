import type { APIRoute } from 'astro';
import { resetDataCache } from '../../../lib/data';
import { jsonResponse, readJsonBody } from '../../../lib/http';
import { guardInternal } from '../../../lib/internal-route';

function parseFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const guard = await guardInternal(request, 'operator');
  if (!guard.ok) return guard.response;
  const db = guard.db;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const raw = (typeof body.value === 'object' && body.value !== null ? body.value : {}) as Record<string, unknown>;
  const enabled = parseFlag(raw.publish_enabled);
  if (enabled === null) {
    return jsonResponse(
      { ok: false, error: 'invalid_payload', detail: 'Cần publish_enabled: true|false.' },
      422,
    );
  }

  const value = enabled ? '1' : '0';
  const updated = await db
    .prepare("UPDATE settings SET value = ?1 WHERE key = 'publish_enabled'")
    .bind(value)
    .run();

  if ((updated.meta?.changes ?? 0) === 0) {
    await db
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('publish_enabled', ?1)")
      .bind(value)
      .run();
  }

  resetDataCache();
  return jsonResponse({ ok: true, publish_enabled: enabled, checked_at: new Date().toISOString() });
};

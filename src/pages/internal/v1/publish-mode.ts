import type { APIRoute } from 'astro';
import { authorize } from '../../../lib/auth';
import { resetDataCache } from '../../../lib/data';
import { getEnv } from '../../../lib/env';
import { jsonResponse, readJsonBody } from '../../../lib/http';

function parseFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const env = await getEnv();
  const auth = await authorize(request, {
    ingestToken: env.INGEST_TOKEN,
    operatorToken: env.OPERATOR_TOKEN,
    require: 'operator',
  });
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  if (!env.DB) return jsonResponse({ ok: false, error: 'database_unavailable' }, 503);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const raw = (typeof body.value === 'object' && body.value !== null ? body.value : {}) as Record<
    string,
    unknown
  >;
  const enabled = parseFlag(raw.publish_enabled);
  if (enabled === null) {
    return jsonResponse(
      {
        ok: false,
        error: 'invalid_payload',
        detail: 'Cần publish_enabled: true|false.',
      },
      422,
    );
  }

  const value = enabled ? '1' : '0';
  const updated = await env.DB.prepare(
    "UPDATE settings SET value = ?1 WHERE key = 'publish_enabled'",
  )
    .bind(value)
    .run();

  if ((updated.meta?.changes ?? 0) === 0) {
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('publish_enabled', ?1)")
      .bind(value)
      .run();
  }

  resetDataCache();

  return jsonResponse({
    ok: true,
    publish_enabled: enabled,
    checked_at: new Date().toISOString(),
  });
};

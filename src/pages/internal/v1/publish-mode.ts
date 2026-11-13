import type { APIRoute } from 'astro';
import { resetDataCache } from '../../../lib/data';
import { jsonResponse, readJsonBody } from '../../../lib/http';
import { guardInternal } from '../../../lib/internal-route';
import { parseFlagUpdates, readFlags, writeFlags } from '../../../lib/settings';

export const POST: APIRoute = async ({ request }) => {
  const guard = await guardInternal(request, 'operator');
  if (!guard.ok) return guard.response;
  const db = guard.db;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const raw = (typeof body.value === 'object' && body.value !== null ? body.value : {}) as Record<string, unknown>;
  const parsed = parseFlagUpdates(raw);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'invalid_payload', detail: parsed.detail }, 422);
  }

  if (!(await writeFlags(db, parsed.updates))) {
    return jsonResponse(
      { ok: false, error: 'write_failed', detail: 'Không ghi được công tắc vào settings.' },
      500,
    );
  }

  resetDataCache();
  return jsonResponse({ ok: true, ...(await readFlags(db)), checked_at: new Date().toISOString() });
};

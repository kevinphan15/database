import type { APIRoute } from 'astro';
import { jsonResponse, rateLimited, readJsonBody } from '../../../lib/http';
import { parseObservation, requestHashOf } from '../../../lib/ingest';
import { processObservation } from '../../../lib/ingest-store';
import { guardInternal } from '../../../lib/internal-route';
import { allowIngest } from '../../../lib/ratelimit';

export const POST: APIRoute = async ({ request }) => {
  const guard = await guardInternal(request, 'ingest');
  if (!guard.ok) return guard.response;

  // Chặn spam trước khi đọc/ghi D1; n8n chạy vài chục request/phút là thoải mái.
  const limit = await allowIngest(request.headers.get('CF-Connecting-IP') ?? 'unknown');
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const idemKey = request.headers.get('idempotency-key')?.trim() ?? '';
  if (idemKey.length < 8 || idemKey.length > 128) {
    return jsonResponse(
      {
        ok: false,
        error: 'invalid_idempotency_key',
        detail: 'Cần header Idempotency-Key dài 8..128 ký tự, không đổi khi retry.',
      },
      400,
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = parseObservation(body.value);
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: 'invalid_payload', errors: parsed.errors }, 422);
  }

  const result = await processObservation(guard.db, {
    observation: parsed.value,
    idemKey,
    requestHash: await requestHashOf(parsed.value),
  });
  return jsonResponse(result.body, result.status);
};

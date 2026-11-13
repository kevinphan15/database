import type { APIRoute } from 'astro';
import { authorize } from '../../../lib/auth';
import { getEnv } from '../../../lib/env';
import { jsonResponse, readJsonBody } from '../../../lib/http';
import { parseObservation, requestHashOf } from '../../../lib/ingest';
import { processObservation } from '../../../lib/ingest-store';

export const POST: APIRoute = async ({ request }) => {
  const env = await getEnv();
  const auth = await authorize(request, {
    ingestToken: env.INGEST_TOKEN,
    operatorToken: env.OPERATOR_TOKEN,
    require: 'ingest',
  });
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);

  if (!env.DB) return jsonResponse({ ok: false, error: 'database_unavailable' }, 503);

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

  const requestHash = await requestHashOf(parsed.value);
  const result = await processObservation(env.DB, {
    observation: parsed.value,
    idemKey,
    requestHash,
  });

  return jsonResponse(result.body, result.status);
};

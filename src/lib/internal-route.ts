/** Bước chung của mọi route `/internal/v1/*`: xác thực token rồi lấy D1. */

import { authorize, type Role } from './auth';
import { getEnv } from './env';
import { jsonResponse } from './http';

type InternalGuard =
  | { ok: true; db: D1Database }
  | { ok: false; response: Response };

export async function guardInternal(request: Request, role: Role): Promise<InternalGuard> {
  const env = await getEnv();
  const auth = await authorize(request, {
    ingestToken: env.INGEST_TOKEN,
    operatorToken: env.OPERATOR_TOKEN,
    require: role,
  });
  if (!auth.ok) {
    return { ok: false, response: jsonResponse({ ok: false, error: auth.error }, auth.status) };
  }
  if (!env.DB) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'database_unavailable' }, 503) };
  }
  return { ok: true, db: env.DB };
}

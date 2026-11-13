/**
 * Xác thực Bearer token cho API nội bộ.
 * - INGEST_TOKEN: n8n, chỉ ghi dữ liệu (result-observations, schedule-sync).
 * - OPERATOR_TOKEN: vận hành (publish-mode, health, và cũng ghi được).
 * So sánh theo kiểu timing-safe trên SHA-256 để không lộ độ dài/tiền tố.
 */

export type Role = 'ingest' | 'operator';

export type AuthResult =
  | { ok: true; role: Role }
  | { ok: false; status: 401 | 403; error: string };

export function parseBearer(header: string | null): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? '');
  return match?.[1]?.trim() || null;
}

async function digest(value: string): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(hash);
}

/** So sánh hằng thời gian trên hash SHA-256 của hai chuỗi. */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export interface AuthOptions {
  ingestToken?: string;
  operatorToken?: string;
  /** Vai trò tối thiểu cần có. */
  require: Role;
}

export async function authorize(request: Request, options: AuthOptions): Promise<AuthResult> {
  const { ingestToken, operatorToken, require } = options;

  // Chưa cấu hình token nào: API nội bộ đóng hẳn, không mở cho request ẩn danh.
  if (!ingestToken && !operatorToken) {
    return { ok: false, status: 403, error: 'internal_api_disabled' };
  }

  const token = parseBearer(request.headers.get('authorization'));
  if (!token) return { ok: false, status: 401, error: 'missing_bearer_token' };

  if (operatorToken && (await timingSafeEqual(token, operatorToken))) {
    return { ok: true, role: 'operator' };
  }

  if (!ingestToken || !(await timingSafeEqual(token, ingestToken))) {
    return { ok: false, status: 401, error: 'invalid_token' };
  }

  return require === 'operator'
    ? { ok: false, status: 403, error: 'operator_token_required' }
    : { ok: true, role: 'ingest' };
}

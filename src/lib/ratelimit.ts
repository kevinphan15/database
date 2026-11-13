/**
 * Giới hạn tần suất cho endpoint công khai và API ingest.
 * Ưu tiên binding Rate Limiting của Cloudflare; nếu không có (local dev, test) thì dùng bộ đếm
 * trong bộ nhớ của isolate — biện pháp tạm, không phân tán giữa các location.
 *
 * `LIMITS` là nguồn duy nhất cho hạn mức và `Retry-After`; test đối chiếu nó với `ratelimits`
 * trong wrangler.jsonc để hai chỗ không lệch nhau.
 */

export const LIMITS = {
  ticket: { binding: 'TICKET_LIMITER', max: 10, windowMs: 60_000 },
  ingest: { binding: 'INGEST_LIMITER', max: 60, windowMs: 60_000 },
} as const;

type LimitKind = keyof typeof LIMITS;

interface LimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const memory = new Map<string, { count: number; resetAt: number }>();

/** Dùng trong test để bỏ bộ đếm giữa các ca. */
export function resetRateLimitState(): void {
  memory.clear();
}

function memoryAllow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

async function bindingLimiter(name: string): Promise<RateLimiter | null> {
  try {
    const mod = (await import('cloudflare:workers')) as { env?: Record<string, unknown> };
    return (mod.env?.[name] as RateLimiter | undefined) ?? null;
  } catch {
    return null;
  }
}

async function allow(kind: LimitKind, key: string): Promise<LimitResult> {
  const { binding, max, windowMs } = LIMITS[kind];
  const limiter = await bindingLimiter(binding);
  const allowed = limiter
    ? (await limiter.limit({ key })).success
    : memoryAllow(`${kind}:${key}`, max, windowMs);
  return { allowed, retryAfterSeconds: Math.ceil(windowMs / 1000) };
}

export const allowTicketCheck = (key: string) => allow('ticket', key);
export const allowIngest = (key: string) => allow('ingest', key);

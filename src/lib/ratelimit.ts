/**
 * Giới hạn tần suất cho endpoint công khai và API ingest.
 * Ưu tiên binding Rate Limiting của Cloudflare; nếu không có (local dev, test) thì dùng bộ đếm
 * trong bộ nhớ của isolate — biện pháp tạm, không phân tán giữa các location.
 */

interface LimitConfig {
  binding: 'TICKET_LIMITER' | 'INGEST_LIMITER';
  max: number;
  windowMs: number;
}

const LIMITS = {
  ticket: { binding: 'TICKET_LIMITER', max: 10, windowMs: 60_000 },
  ingest: { binding: 'INGEST_LIMITER', max: 60, windowMs: 60_000 },
} as const satisfies Record<string, LimitConfig>;

export type LimitKind = keyof typeof LIMITS;

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const memory = new Map<string, { count: number; resetAt: number }>();

/** Dùng trong test để bỏ bộ đếm giữa các ca. */
export function resetRateLimitState(): void {
  memory.clear();
}

function memoryAllow(key: string, max: number, windowMs: number, now: number): boolean {
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

export async function allow(kind: LimitKind, key: string): Promise<boolean> {
  const config = LIMITS[kind];
  const limiter = await bindingLimiter(config.binding);
  if (limiter) {
    const result = await limiter.limit({ key });
    return result.success;
  }
  return memoryAllow(`${kind}:${key}`, config.max, config.windowMs, Date.now());
}

export const allowTicketCheck = (key: string) => allow('ticket', key);
export const allowIngest = (key: string) => allow('ingest', key);

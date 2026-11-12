/**
 * Giới hạn tần suất cho công cụ dò vé.
 * Ưu tiên binding Rate Limiting của Cloudflare (TICKET_LIMITER); nếu không có (local dev)
 * thì dùng bộ đếm trong bộ nhớ của isolate — chỉ là biện pháp tạm, không phân tán.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryAllow(key: string): boolean {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export async function allowTicketCheck(key: string): Promise<boolean> {
  try {
    const mod = (await import('cloudflare:workers')) as { env?: { TICKET_LIMITER?: RateLimiter } };
    const limiter = mod.env?.TICKET_LIMITER;
    if (limiter) {
      const result = await limiter.limit({ key });
      return result.success;
    }
  } catch {
    // Không có binding → dùng bộ đếm trong bộ nhớ.
  }
  return memoryAllow(key);
}

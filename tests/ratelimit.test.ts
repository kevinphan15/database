import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: {} }));

import { readFileSync } from 'node:fs';
import { allowIngest, allowTicketCheck, LIMITS, resetRateLimitState } from '../src/lib/ratelimit';
import { rateLimited } from '../src/lib/http';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T03:00:00Z'));
  resetRateLimitState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rate limit ingest', () => {
  it('cho 60 request mỗi cửa sổ rồi trả 429', async () => {
    for (let i = 0; i < 60; i += 1) {
      expect((await allowIngest('1.2.3.4')).allowed).toBe(true);
    }
    expect(await allowIngest('1.2.3.4')).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it('mỗi IP có bộ đếm riêng', async () => {
    for (let i = 0; i < 60; i += 1) await allowIngest('1.2.3.4');
    expect((await allowIngest('1.2.3.4')).allowed).toBe(false);
    expect((await allowIngest('5.6.7.8')).allowed).toBe(true);
  });

  it('hết cửa sổ 60 giây thì cho gửi lại', async () => {
    for (let i = 0; i < 60; i += 1) await allowIngest('1.2.3.4');
    expect((await allowIngest('1.2.3.4')).allowed).toBe(false);

    vi.setSystemTime(new Date('2026-11-13T03:01:01Z'));
    expect((await allowIngest('1.2.3.4')).allowed).toBe(true);
  });

  it('không ảnh hưởng bộ đếm dò vé', async () => {
    for (let i = 0; i < 60; i += 1) await allowIngest('1.2.3.4');
    expect((await allowTicketCheck('1.2.3.4')).allowed).toBe(true);
  });
});

describe('rate limit dò vé', () => {
  it('vẫn giữ 10 request mỗi phút', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await allowTicketCheck('1.2.3.4')).allowed).toBe(true);
    }
    expect((await allowTicketCheck('1.2.3.4')).allowed).toBe(false);
  });
});

describe('Retry-After suy ra từ cửa sổ limiter', () => {
  it('429 trả đúng số giây được truyền vào', () => {
    const response = rateLimited(120);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('120');
  });

  it('cấu hình trong code khớp với wrangler.jsonc (không lệch period)', () => {
    const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    const limiter = (name: string) => {
      const match = new RegExp(
        `"name"\\s*:\\s*"${name}"[^}]*?"limit"\\s*:\\s*(\\d+)\\s*,\\s*"period"\\s*:\\s*(\\d+)`,
      ).exec(wrangler);
      return match ? { limit: Number(match[1]), period: Number(match[2]) } : null;
    };

    const ticket = limiter('TICKET_LIMITER');
    const ingest = limiter('INGEST_LIMITER');
    expect(ticket).not.toBeNull();
    expect(ingest).not.toBeNull();
    expect(ticket?.limit).toBe(LIMITS.ticket.max);
    expect(ticket?.period * 1000).toBe(LIMITS.ticket.windowMs);
    expect(ingest?.limit).toBe(LIMITS.ingest.max);
    expect(ingest?.period * 1000).toBe(LIMITS.ingest.windowMs);
  });
});

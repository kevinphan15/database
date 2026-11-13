import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: {} }));

import { allowIngest, allowTicketCheck, resetRateLimitState } from '../src/lib/ratelimit';

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
      expect(await allowIngest('1.2.3.4')).toBe(true);
    }
    expect(await allowIngest('1.2.3.4')).toBe(false);
  });

  it('mỗi IP có bộ đếm riêng', async () => {
    for (let i = 0; i < 60; i += 1) await allowIngest('1.2.3.4');
    expect(await allowIngest('1.2.3.4')).toBe(false);
    expect(await allowIngest('5.6.7.8')).toBe(true);
  });

  it('hết cửa sổ 60 giây thì cho gửi lại', async () => {
    for (let i = 0; i < 60; i += 1) await allowIngest('1.2.3.4');
    expect(await allowIngest('1.2.3.4')).toBe(false);

    vi.setSystemTime(new Date('2026-11-13T03:01:01Z'));
    expect(await allowIngest('1.2.3.4')).toBe(true);
  });

  it('không ảnh hưởng bộ đếm dò vé', async () => {
    for (let i = 0; i < 60; i += 1) await allowIngest('1.2.3.4');
    expect(await allowTicketCheck('1.2.3.4')).toBe(true);
  });
});

describe('rate limit dò vé', () => {
  it('vẫn giữ 10 request mỗi phút', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect(await allowTicketCheck('1.2.3.4')).toBe(true);
    }
    expect(await allowTicketCheck('1.2.3.4')).toBe(false);
  });
});

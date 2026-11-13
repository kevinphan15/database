import { describe, expect, it, vi } from 'vitest';
import { fixtureDataset } from '../src/lib/fixture';
import { nextDrawAt, resultsPayload, schedulePayload, ticketCheckPayload } from '../src/lib/public-api';

// Route công khai đọc qua loadDataset; mock để test phần header, không cần D1.
vi.mock('../src/lib/data', async () => {
  const { fixtureDataset: fixture } = await import('../src/lib/fixture');
  return {
    loadDataset: async () => ({ dataset: fixture, source: 'd1', degraded: false }),
    resetDataCache: () => {},
  };
});

import { GET as resultsGET } from '../src/pages/api/v1/results';
import { GET as scheduleGET } from '../src/pages/api/v1/schedule';
import { POST as ticketCheckPOST } from '../src/pages/api/v1/ticket-check';

describe('GET /api/v1/results', () => {
  it('trả kỳ mới nhất của một đài, giữ số 0 ở đầu', () => {
    const reply = resultsPayload(fixtureDataset, { station: 'dong-nai' });
    expect(reply.status).toBe(200);
    const items = reply.body.items as { draw_date: string; prizes: Record<string, string[]> }[];
    expect(reply.body.count).toBe(2);
    expect(items[0]?.draw_date).toBe('2026-11-11');
    expect(items[0]?.prizes.special).toEqual(['009876']);
    expect(items[1]?.prizes.seventh).toEqual(['007']);
  });

  it('lọc theo ngày', () => {
    const reply = resultsPayload(fixtureDataset, { station: 'dong-nai', date: '2026-11-04' });
    expect(reply.body.count).toBe(1);
    const items = reply.body.items as { draw_date: string; status: string }[];
    expect(items[0]).toMatchObject({ draw_date: '2026-11-04', status: 'confirmed' });
  });

  it('không có dai thì trả kỳ mới nhất toàn bộ đài', () => {
    const reply = resultsPayload(fixtureDataset);
    expect(reply.body.count).toBe(2);
  });

  it('ngày không có kỳ nào thì trả mảng rỗng, không lỗi', () => {
    const reply = resultsPayload(fixtureDataset, { date: '2026-11-12' });
    expect(reply.status).toBe(200);
    expect(reply.body.count).toBe(0);
  });

  it('áp limit', () => {
    const reply = resultsPayload(fixtureDataset, { station: 'dong-nai', limit: 1 });
    expect(reply.body.count).toBe(1);
    expect(reply.body.limit).toBe(1);
  });

  it('404 khi đài không tồn tại', () => {
    expect(resultsPayload(fixtureDataset, { station: 'khong-co' })).toEqual({
      status: 404,
      body: { ok: false, error: 'unknown_station' },
    });
  });

  it('422 khi ngày sai định dạng', () => {
    const reply = resultsPayload(fixtureDataset, { date: '2026-2-1' });
    expect(reply.status).toBe(422);
    expect(reply.body.error).toBe('invalid_date');
  });
});

describe('GET /api/v1/schedule', () => {
  // 2026-11-12 là thứ Năm; kỳ kế tiếp là thứ Tư 2026-11-18 16:10 giờ VN = 09:10Z.
  const now = new Date('2026-11-12T00:00:00Z');

  it('tính mốc kỳ kế tiếp và cửa sổ theo dõi', () => {
    const reply = schedulePayload(fixtureDataset, now.toISOString());
    expect(reply.status).toBe(200);
    const items = reply.body.items as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      next_draw_at_utc: '2026-11-18T09:10:00Z',
      window_start_utc: '2026-11-18T09:00:00Z',
      expected_final_at_utc: '2026-11-18T10:40:00Z',
      window_end_utc: '2026-11-18T11:10:00Z',
    });
    expect(items[0]?.rules).toEqual([
      { iso_weekday: 3, local_time: '16:10', from_date: '2026-01-01', to_date: null },
    ]);
  });

  it('đúng giờ quay thì lấy kỳ tuần sau (không trả mốc đã qua)', () => {
    const reply = schedulePayload(fixtureDataset, '2026-11-18T09:10:00Z');
    const items = reply.body.items as Record<string, unknown>[];
    expect(items[0]?.next_draw_at_utc).toBe('2026-11-25T09:10:00Z');
  });

  it('nextDrawAt trả null với giờ sai', () => {
    expect(nextDrawAt(3, '25:00', now)).toBeNull();
    expect(nextDrawAt(3, 'không phải giờ', now)).toBeNull();
  });
});

describe('POST /api/v1/ticket-check', () => {
  it('báo trúng giải khi vé khớp giải đặc biệt của kỳ đã xác nhận', () => {
    const reply = ticketCheckPayload(fixtureDataset, {
      station: 'dong-nai',
      date: '2026-11-04',
      ticket: '001234',
    });
    expect(reply.status).toBe(200);
    const result = reply.body.result as { kind: string; hits: { code: string; matched: string }[] };
    expect(result.kind).toBe('prize');
    expect(result.hits[0]).toMatchObject({ code: 'special', matched: '001234' });
  });

  it('từ chối kỳ chưa xác nhận', () => {
    const reply = ticketCheckPayload(fixtureDataset, {
      station: 'dong-nai',
      date: '2026-11-11',
      ticket: '009876',
    });
    expect(reply.status).toBe(200);
    expect((reply.body.result as { kind: string }).kind).toBe('not-confirmed');
  });

  it('không trúng giải nào', () => {
    const reply = ticketCheckPayload(fixtureDataset, {
      station: 'dong-nai',
      date: '2026-11-04',
      ticket: '000000',
    });
    expect((reply.body.result as { kind: string }).kind).toBe('no-prize');
  });

  it('422 khi vé sai định dạng', () => {
    const reply = ticketCheckPayload(fixtureDataset, {
      station: 'dong-nai',
      date: '2026-11-04',
      ticket: '12ab34',
    });
    expect(reply.status).toBe(422);
    expect(reply.body.error).toBe('invalid_ticket');
  });

  it('422 khi thiếu/sai đài hoặc ngày', () => {
    expect(ticketCheckPayload(fixtureDataset, { date: '2026-11-04', ticket: '001234' }).body.error).toBe(
      'unknown_station',
    );
    expect(
      ticketCheckPayload(fixtureDataset, { station: 'dong-nai', date: '2026-02-30', ticket: '001234' }).body.error,
    ).toBe('invalid_date');
    expect(ticketCheckPayload(fixtureDataset, null).body.error).toBe('invalid_payload');
  });

  it('chấp nhận khoá tiếng Việt (dai/ngay/so) như bản cũ', () => {
    const reply = ticketCheckPayload(fixtureDataset, {
      dai: 'dong-nai',
      ngay: '2026-11-04',
      so: '001 234',
    });
    expect(reply.status).toBe(200);
    expect((reply.body.result as { kind: string }).kind).toBe('prize');
  });
});

/**
 * Route công khai không được giữ TTL, kể cả response lỗi: `generated_at`/`degraded`/kết quả
 * dò vé đều tính theo lúc gọi, và bản `public, max-age` từng khiến client thấy dữ liệu cũ.
 * Mỗi lần gọi dùng một IP riêng để bộ đếm rate limit trong bộ nhớ không ảnh hưởng lẫn nhau.
 */
describe('cache-control của route công khai', () => {
  let caller = 0;

  function call(handler: unknown, path: string, init?: RequestInit, ip?: string) {
    caller += 1;
    const url = new URL(path, 'https://xoso.test').toString();
    return (
      handler as (context: { url: URL; request: Request; clientAddress: string }) => Promise<Response>
    )({
      url: new URL(url),
      request: new Request(url, init),
      clientAddress: ip ?? `203.0.113.${caller}`,
    });
  }

  async function cacheControl(handler: unknown, path: string, init?: RequestInit) {
    return (await call(handler, path, init)).headers.get('cache-control') ?? '';
  }

  const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

  it('GET /api/v1/schedule/ trả no-store', async () => {
    expect(await cacheControl(scheduleGET, '/api/v1/schedule/')).toBe('no-store');
  });

  it('GET /api/v1/results/ trả no-store', async () => {
    expect(await cacheControl(resultsGET, '/api/v1/results/?dai=dong-nai')).toBe('no-store');
  });

  it('POST /api/v1/ticket-check/ trả no-store', async () => {
    const body = json({ station: 'dong-nai', date: '2026-11-04', ticket: '001234' });
    expect(await cacheControl(ticketCheckPOST, '/api/v1/ticket-check/', body)).toBe('no-store');
  });

  // 400 và 429 đi qua header mặc định của `jsonResponse` (đã là `private`), không qua nhánh đè header.
  it('400 và 429 của /api/v1/ticket-check/ cũng không cache', async () => {
    expect(
      await cacheControl(ticketCheckPOST, '/api/v1/ticket-check/', { method: 'POST', body: 'không-phải-json' }),
    ).toBe('no-store, private');

    // LIMITS.ticket.max = 10 mỗi 60 giây cho một IP; lần thứ 11 phải bị chặn.
    const body = json({ station: 'dong-nai', date: '2026-11-04', ticket: '001234' });
    let denied: Response | undefined;
    for (let i = 0; i <= 10; i += 1) {
      denied = await call(ticketCheckPOST, '/api/v1/ticket-check/', body, '198.51.100.99');
    }
    expect(denied?.status).toBe(429);
    expect(denied?.headers.get('cache-control')).toBe('no-store, private');
  });
});

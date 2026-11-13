/**
 * Khoá hành vi khi D1 lỗi TRUY VẤN (khác D1 rỗng): người đọc phải thấy banner giải thích, trang
 * miền/đài/ngày trả 503 (không phải 404 — URL vẫn đúng), và API báo `degraded: true`.
 * Chạy bằng AstroContainer nên không cần browser.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dataset } from '../src/lib/types';

const EMPTY: Dataset = {
  notice: '',
  is_fixture: false,
  index_enabled: true,
  product_code: 'xs-mn',
  prize_rule_version: 1,
  regions: [],
  stations: [],
  prize_rules: [],
  schedule: [],
  exceptions: [],
  draws: [],
};

const state = vi.hoisted(() => ({
  data: null as unknown,
}));

vi.mock('../src/lib/data', () => ({
  loadDataset: async () => state.data,
  resetDataCache: () => {},
}));

import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { DATA_UNAVAILABLE_NOTICE, DATA_UNAVAILABLE_TITLE } from '../src/lib/degraded';
import { allowTicketCheck, LIMITS, resetRateLimitState } from '../src/lib/ratelimit';

import NotFoundPage from '../src/pages/404.astro';
import HomePage from '../src/pages/index.astro';
import RegionPage from '../src/pages/xo-so-[mien]/index.astro';
import SchedulePage from '../src/pages/lich-mo-thuong/index.astro';
import LedgerPage from '../src/pages/so-ket-qua/index.astro';
import StatsPage from '../src/pages/thong-ke/giai-dac-biet.astro';
import DoVeSoPage from '../src/pages/do-ve-so/index.astro';
import StationOrDatePage from '../src/pages/xo-so-[mien]/[slug]/index.astro';
import DatePage from '../src/pages/xo-so-[mien]/[dai]/[ngay]/index.astro';
import { GET as resultsGET } from '../src/pages/api/v1/results';

const BASE = 'https://xoso.test';
const container = await AstroContainer.create();

function degraded(): Dataset {
  // Đúng những gì loadDataset trả khi truy vấn D1 ném lỗi: dataset rỗng + notice + degraded.
  return { ...EMPTY, notice: DATA_UNAVAILABLE_NOTICE };
}

async function render(
  page: Parameters<typeof container.renderToResponse>[0],
  path: string,
  params: Record<string, string> = {},
  init?: RequestInit,
) {
  const response = await container.renderToResponse(page, {
    request: new Request(`${BASE}${path}`, init),
    params,
  });
  return {
    status: response.status,
    cacheControl: response.headers.get('cache-control') ?? '',
    xRobotsTag: response.headers.get('x-robots-tag') ?? '',
    html: await response.text(),
  };
}

beforeEach(() => {
  state.data = { dataset: degraded(), source: 'd1', degraded: true };
  resetRateLimitState();
});

describe('D1 lỗi truy vấn → 503, no-store, banner', () => {
  it('trang chủ: 503 như trang miền/đài/ngày, banner, không cache, không lộ dữ liệu mẫu', async () => {
    const { status, cacheControl, html } = await render(HomePage, '/');
    expect(status).toBe(503);
    expect(cacheControl).toBe('no-store');
    expect(html).toContain(DATA_UNAVAILABLE_NOTICE);
    expect(html).not.toContain('DỮ LIỆU MẪU');
  });

  it('trang lịch mở thưởng: 503, không cache', async () => {
    const { status, cacheControl } = await render(SchedulePage, '/lich-mo-thuong/');
    expect(status).toBe(503);
    expect(cacheControl).toBe('no-store');
  });

  it('trang sổ kết quả: 503, không cache', async () => {
    const { status, cacheControl } = await render(LedgerPage, '/so-ket-qua/');
    expect(status).toBe(503);
    expect(cacheControl).toBe('no-store');
  });

  it('trang thống kê giải đặc biệt: 503, không cache', async () => {
    const { status, cacheControl } = await render(StatsPage, '/thong-ke/giai-dac-biet/');
    expect(status).toBe(503);
    expect(cacheControl).toBe('no-store');
  });

  it('trang dò vé: 503, không cache', async () => {
    const { status, cacheControl } = await render(DoVeSoPage, '/do-ve-so/');
    expect(status).toBe(503);
    expect(cacheControl).toBe('no-store');
  });

  it('trang dò vé (POST body không phải form): 503, không cache', async () => {
    const { status, cacheControl } = await render(DoVeSoPage, '/do-ve-so/', {}, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' },
      body: '{"ticket":"001234"}',
    });
    expect(status).toBe(503);
    expect(cacheControl).toBe('no-store');
  });

  it('trang dò vé (POST form): 503, không cache', async () => {
    const { status, cacheControl } = await render(DoVeSoPage, '/do-ve-so/', {}, {
      method: 'POST',
      // POST đi qua limiter trước khi đọc body, và AstroContainer không cấp `Astro.clientAddress` —
      // thiếu header IP là trang ném lỗi thay vì trả response.
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '203.0.113.9' },
      body: 'ticket=001234',
    });
    expect(status).toBe(503);
    expect(cacheControl).toBe('no-store');
  });

  it('trang dò vé (POST bị chặn tần suất): 503, không cache', async () => {
    const ip = '203.0.113.13';
    for (let i = 0; i < LIMITS.ticket.max; i += 1) await allowTicketCheck(ip);
    const { status, cacheControl, html } = await render(DoVeSoPage, '/do-ve-so/', {}, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip },
      body: 'ticket=001234',
    });
    expect(status).toBe(503);
    expect(cacheControl).toBe('no-store');
    expect(html).toContain('Quá nhiều lần dò');
  });

  // Nội dung trang lịch: D1 lỗi thì phải hiện banner, không được khẳng định "hôm nay không có đài".
  it('trang lịch không khẳng định sai khi D1 lỗi', async () => {
    const { html } = await render(SchedulePage, '/lich-mo-thuong/');
    expect(html).toContain(DATA_UNAVAILABLE_NOTICE);
    expect(html).not.toContain('Hôm nay không có đài nào quay');
  });
});

describe('POST /do-ve-so/ luôn noindex, follow', () => {
  const post = () =>
    render(DoVeSoPage, '/do-ve-so/', {}, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'CF-Connecting-IP': '203.0.113.12',
      },
      body: 'ticket=001234',
    });

  it('khi D1 lỗi', async () => {
    expect((await post()).xRobotsTag).toBe('noindex, follow');
  });

  it('khi D1 khoẻ', async () => {
    state.data = { dataset: EMPTY, source: 'd1', degraded: false };
    expect((await post()).xRobotsTag).toBe('noindex, follow');
  });
});

describe('D1 lỗi truy vấn → 503, không phải 404', () => {
  it('trang miền: 503, noindex, không canonical, không cache', async () => {
    const { status, cacheControl, html } = await render(RegionPage, '/xo-so-mien-nam/', {
      mien: 'mien-nam',
    });
    expect(status).toBe(503);
    expect(cacheControl).toBe('no-store');
    expect(html).toContain('Đây không phải lỗi đường dẫn');
    expect(html).toContain('name="robots" content="noindex, follow"');
    expect(html).not.toContain('rel="canonical"');
  });

  it('trang đài: 503, không cache', async () => {
    const { status, cacheControl, html } = await render(
      StationOrDatePage,
      '/xo-so-mien-nam/dong-nai/',
      { mien: 'mien-nam', slug: 'dong-nai' },
    );
    expect(status).toBe(503);
    expect(cacheControl).toBe('no-store');
    expect(html).toContain(DATA_UNAVAILABLE_TITLE);
  });

  it('trang ngày: 503, không cache', async () => {
    const { status, cacheControl, html } = await render(
      DatePage,
      '/xo-so-mien-nam/dong-nai/2026-11-11/',
      { mien: 'mien-nam', dai: 'dong-nai', ngay: '2026-11-11' },
    );
    expect(status).toBe(503);
    expect(cacheControl).toBe('no-store');
    expect(html).toContain(DATA_UNAVAILABLE_TITLE);
  });
});

describe('404 không được cache theo heuristic', () => {
  beforeEach(() => {
    // D1 đọc được nhưng không có dữ liệu: đây là 404 thật, không phải 503 degraded.
    state.data = { dataset: EMPTY, source: 'd1', degraded: false };
  });

  it('trang 404 chung: no-store', async () => {
    const { status, cacheControl } = await render(NotFoundPage, '/khong-ton-tai/');
    expect(status).toBe(404);
    expect(cacheControl).toBe('no-store');
  });

  it('404 của trang miền: no-store', async () => {
    const { status, cacheControl } = await render(RegionPage, '/xo-so-mien-nam/khong-co/', {
      mien: 'khong-co',
    });
    expect(status).toBe(404);
    expect(cacheControl).toBe('no-store');
  });

  it('404 của trang đài/ngày: no-store', async () => {
    const { status, cacheControl } = await render(
      StationOrDatePage,
      '/xo-so-mien-nam/dong-nai/2026-11-12/',
      { mien: 'mien-nam', slug: '2026-11-12' },
    );
    expect(status).toBe(404);
    expect(cacheControl).toBe('no-store');
  });
});

describe('không có lỗi D1 → không 503, không banner', () => {
  beforeEach(() => {
    state.data = { dataset: EMPTY, source: 'd1', degraded: false };
  });

  it('miền không tồn tại vẫn 404 (503 chỉ dành cho lỗi D1)', async () => {
    const { status, html } = await render(RegionPage, '/xo-so-mien-nam/khong-co/', {
      mien: 'khong-co',
    });
    expect(status).toBe(404);
    expect(html).toContain('Không tìm thấy miền');
    expect(html).not.toContain(DATA_UNAVAILABLE_NOTICE);
  });

  it('ngày không có lịch quay vẫn 404', async () => {
    const { status } = await render(
      StationOrDatePage,
      '/xo-so-mien-nam/dong-nai/2026-11-12/',
      { mien: 'mien-nam', slug: '2026-11-12' },
    );
    expect(status).toBe(404);
  });

  it('trang dò vé (POST body không phải form): 200, không 500', async () => {
    const { status, cacheControl } = await render(DoVeSoPage, '/do-ve-so/', {}, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.11' },
      body: '{"ticket":"001234"}',
    });
    expect(status).toBe(200);
    expect(cacheControl).toBe('no-store');
  });

  it('POST body không phải form vẫn bị đếm vào rate limit', async () => {
    const post = () =>
      render(DoVeSoPage, '/do-ve-so/', {}, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.7' },
        body: '{"ticket":"001234"}',
      });
    for (let i = 0; i < LIMITS.ticket.max; i += 1) {
      expect((await post()).html).not.toContain('Quá nhiều lần dò');
    }
    expect((await post()).html).toContain('Quá nhiều lần dò');
  });

  it('trang 200 bình thường không bị gán no-store', async () => {
    const { status, cacheControl } = await render(HomePage, '/');
    expect(status).toBe(200);
    expect(cacheControl).toBe('');
  });
});

describe('API báo lỗi D1 bằng degraded', () => {
  async function callResults() {
    const response = await resultsGET({
      url: new URL(`${BASE}/api/v1/results/`),
    } as Parameters<typeof resultsGET>[0]);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it('degraded: true khi D1 lỗi', async () => {
    const { status, body } = await callResults();
    expect(status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.count).toBe(0);
    expect(body.notice).toBe(DATA_UNAVAILABLE_NOTICE);
  });

  it('degraded: false khi D1 đọc được', async () => {
    state.data = { dataset: EMPTY, source: 'd1', degraded: false };
    const { body } = await callResults();
    expect(body.degraded).toBe(false);
    expect(body.notice).toBeNull();
  });
});

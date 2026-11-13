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

import HomePage from '../src/pages/index.astro';
import RegionPage from '../src/pages/xo-so-[mien]/index.astro';
import SchedulePage from '../src/pages/lich-mo-thuong/index.astro';
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
) {
  const response = await container.renderToResponse(page, {
    request: new Request(`${BASE}${path}`),
    params,
  });
  return { status: response.status, html: await response.text() };
}

beforeEach(() => {
  state.data = { dataset: degraded(), source: 'd1', degraded: true };
});

describe('D1 lỗi truy vấn → banner giải thích', () => {
  it('trang chủ: 200 + banner, không lộ dữ liệu mẫu', async () => {
    const { status, html } = await render(HomePage, '/');
    expect(status).toBe(200);
    expect(html).toContain(DATA_UNAVAILABLE_NOTICE);
    expect(html).not.toContain('DỮ LIỆU MẪU');
  });

  it('trang lịch mở thưởng: 200 + banner, không khẳng định sai "hôm nay không có đài"', async () => {
    const { status, html } = await render(SchedulePage, '/lich-mo-thuong/');
    expect(status).toBe(200);
    expect(html).toContain(DATA_UNAVAILABLE_NOTICE);
    expect(html).not.toContain('Hôm nay không có đài nào quay');
  });
});

describe('D1 lỗi truy vấn → 503, không phải 404', () => {
  it('trang miền: 503, noindex, không canonical', async () => {
    const { status, html } = await render(RegionPage, '/xo-so-mien-nam/', { mien: 'mien-nam' });
    expect(status).toBe(503);
    expect(html).toContain('Đây không phải lỗi đường dẫn');
    expect(html).toContain('name="robots" content="noindex, follow"');
    expect(html).not.toContain('rel="canonical"');
  });

  it('trang đài: 503', async () => {
    const { status, html } = await render(StationOrDatePage, '/xo-so-mien-nam/dong-nai/', {
      mien: 'mien-nam',
      slug: 'dong-nai',
    });
    expect(status).toBe(503);
    expect(html).toContain(DATA_UNAVAILABLE_TITLE);
  });

  it('trang ngày: 503', async () => {
    const { status, html } = await render(
      DatePage,
      '/xo-so-mien-nam/dong-nai/2026-11-11/',
      { mien: 'mien-nam', dai: 'dong-nai', ngay: '2026-11-11' },
    );
    expect(status).toBe(503);
    expect(html).toContain(DATA_UNAVAILABLE_TITLE);
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

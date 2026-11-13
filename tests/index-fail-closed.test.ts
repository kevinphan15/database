/**
 * Deploy tối: không đọc được `settings` (D1 lỗi truy vấn) thì index phải TẮT.
 * Fail-open ở đây sẽ mở index cho robots.txt/sitemap.xml của một site chưa được duyệt.
 * Ngược lại, thiếu hàng trong settings vẫn là bật (để không tự khoá site đang chạy).
 * Cũng khoá việc hai response này không được cache: `public, max-age=3600` từng khiến
 * trình duyệt/crawler giữ `Allow: /` + sitemap có URL tới 1 giờ sau khi tắt index.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  db: null as unknown,
}));

vi.mock('cloudflare:workers', () => ({
  get env() {
    return state.db ? { DB: state.db } : {};
  },
}));

vi.mock('astro:content', () => ({ getCollection: async () => [] }));

import { GET as robotsGET } from '../src/pages/robots.txt';
import { GET as sitemapGET } from '../src/pages/sitemap.xml';
import { resetDataCache } from '../src/lib/data';

/** D1 lỗi ở mọi truy vấn (bảng không tồn tại / D1 hỏng). */
function brokenD1() {
  return {
    prepare() {
      throw new Error('D1_ERROR: no such table: settings');
    },
  };
}

/** D1 đọc được nhưng chưa có hàng nào trong settings. */
function emptyD1() {
  return {
    prepare: () => ({ all: async () => ({ results: [] }) }),
  };
}

async function call(path: string, route: unknown) {
  const get = route as (context: { url: URL }) => Promise<Response>;
  const response = await get({ url: new URL(`https://xoso.test${path}`) });
  return {
    status: response.status,
    body: await response.text(),
    cacheControl: response.headers.get('cache-control') ?? '',
  };
}

beforeEach(() => {
  resetDataCache();
  state.db = null;
});

describe('robots.txt', () => {
  it('D1 lỗi → Disallow: /, không khai sitemap', async () => {
    state.db = brokenD1();
    const { status, body } = await call('/robots.txt', robotsGET);
    expect(status).toBe(200);
    expect(body).toContain('Disallow: /');
    expect(body).not.toContain('Allow: /');
    expect(body).not.toContain('Sitemap:');
  });

  it('thiếu hàng settings (D1 khoẻ) → vẫn bật như cũ', async () => {
    state.db = emptyD1();
    const { body } = await call('/robots.txt', robotsGET);
    expect(body).toContain('Allow: /');
    expect(body).toContain('Sitemap: https://xoso.test/sitemap.xml');
  });

});

describe('sitemap.xml', () => {
  it('D1 lỗi → urlset rỗng, vẫn 200', async () => {
    state.db = brokenD1();
    const { status, body } = await call('/sitemap.xml', sitemapGET);
    expect(status).toBe(200);
    expect(body).toContain('</urlset>');
    expect(body).not.toContain('<url>');
  });

  it('thiếu hàng settings (D1 khoẻ) → vẫn có URL như cũ', async () => {
    state.db = emptyD1();
    const { body } = await call('/sitemap.xml', sitemapGET);
    expect(body).toContain('<url>');
  });

});

describe('robots.txt và sitemap.xml không được cache', () => {
  it('trả đúng no-store, không có cửa sổ max-age giữ bản index-bật', async () => {
    state.db = emptyD1();
    const robots = await call('/robots.txt', robotsGET);
    const sitemap = await call('/sitemap.xml', sitemapGET);
    expect(robots.cacheControl).toBe('no-store');
    expect(sitemap.cacheControl).toBe('no-store');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('astro:middleware', () => ({ defineMiddleware: (fn: unknown) => fn }));

// Công tắc đọc qua loadDataset(); mock để bật/tắt trong từng ca.
const state = vi.hoisted(() => ({ enabled: true }));
vi.mock('../src/lib/data', () => ({
  loadDataset: async () => ({
    dataset: { index_enabled: state.enabled },
    source: 'd1',
  }),
}));

import { fixtureDataset } from '../src/lib/fixture';
import { decideIndex, robotsContent, type PageKind } from '../src/lib/policy';
import { buildSitemap, renderRobots, renderSitemap } from '../src/lib/sitemap';
import { onRequest } from '../src/middleware';
import { resetRedirectCache } from '../src/lib/redirects';

const baseUrl = 'https://xoso.test';
const KINDS: PageKind[] = [
  'home',
  'region',
  'station',
  'date',
  'schedule',
  'ledger',
  'ticket-tool',
  'ticket-check',
  'guide',
  'stats',
];

describe('công tắc index toàn cục', () => {
  it('tắt thì mọi loại trang đều noindex, nofollow', () => {
    for (const kind of KINDS) {
      const decision = decideIndex({ kind, hasPrizes: true, indexEnabled: false });
      expect(decision.index).toBe(false);
      expect(decision.follow).toBe(false);
      expect(robotsContent(decision)).toBe('noindex, nofollow');
    }
  });

  it('bật thì trang ngày vẫn index + self-canonical như cũ', () => {
    const decision = decideIndex({ kind: 'date', hasPrizes: true, indexEnabled: true });
    expect(robotsContent(decision)).toBe('index, follow');
  });
});

describe('robots.txt theo công tắc', () => {
  it('tắt thì chặn toàn bộ và không khai sitemap', () => {
    const txt = renderRobots(baseUrl, false);
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Disallow: /\n');
    expect(txt).not.toContain('Allow: /');
    expect(txt).not.toContain('Sitemap:');
  });

  it('bật thì giữ luật chặn tham số và trỏ sitemap', () => {
    const txt = renderRobots(baseUrl, true);
    expect(txt).toContain('Allow: /');
    expect(txt).toContain('Disallow: /*?dai=');
    expect(txt).toContain(`Sitemap: ${baseUrl}/sitemap.xml`);
  });
});

describe('sitemap theo công tắc', () => {
  it('tắt thì urlset rỗng', () => {
    const xml = renderSitemap(
      buildSitemap({ ...fixtureDataset, index_enabled: false }, { baseUrl, today: '2026-11-12' }),
    );
    expect(xml).not.toContain('<url>');
    expect(xml).toContain('</urlset>');
  });

  it('bật thì có URL như cũ', () => {
    const entries = buildSitemap(fixtureDataset, { baseUrl, today: '2026-11-12' });
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe('middleware X-Robots-Tag', () => {
  const NEXT = new Response('<html></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });

  type Context = Parameters<typeof onRequest>[0];
  type Next = Parameters<typeof onRequest>[1];

  function makeContext(url = `${baseUrl}/khong-ton-tai/`): Context {
    const parsed = new URL(url);
    return {
      request: new Request(parsed),
      url: parsed,
      redirect: (location: string, status: number) =>
        new Response(null, { status, headers: { Location: location } }),
    } as unknown as Context;
  }

  async function run(next: () => Promise<Response> = async () => NEXT) {
    return onRequest(makeContext(), next as unknown as Next);
  }

  beforeEach(() => {
    resetRedirectCache();
    state.enabled = true;
  });

  it('tắt thì gắn noindex cho response HTML và giữ nguyên nội dung/status', async () => {
    state.enabled = false;
    const response = await run();
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html></html>');
  });

  it('tắt thì không ghi đè header trang đã tự đặt', async () => {
    state.enabled = false;
    const response = await run(
      async () => new Response('kết quả dò', { status: 200, headers: { 'x-robots-tag': 'noindex, follow' } }),
    );
    expect(response.headers.get('x-robots-tag')).toBe('noindex, follow');
  });

  it('bật thì không thêm header và trả nguyên response', async () => {
    const response = await run();
    expect(response).toBe(NEXT);
    expect(response.headers.get('x-robots-tag')).toBeNull();
  });
});

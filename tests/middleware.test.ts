import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('astro:middleware', () => ({ defineMiddleware: (fn: unknown) => fn }));
// Không có D1 → middleware dùng bản đồ tĩnh, kết quả tất định.
vi.mock('cloudflare:workers', () => ({ env: {} }));

import { onRequest } from '../src/middleware';
import { resetRedirectCache } from '../src/lib/redirects';

const NEXT = new Response('trang gốc', { status: 200 });
const OLD_PATH = '/kqxs-mien-nam/';
const NEW_PATH = '/xo-so-mien-nam/';

type Context = Parameters<typeof onRequest>[0];
type Next = Parameters<typeof onRequest>[1];

function makeContext(method: string, url: string): Context {
  const parsed = new URL(url, 'https://xoso.test');
  return {
    request: new Request(parsed, { method }),
    url: parsed,
    redirect: (location: string, status: number) =>
      new Response(null, { status, headers: { Location: location } }),
  } as unknown as Context;
}

async function run(method: string, url: string) {
  const next = vi.fn(async () => NEXT);
  const response = await onRequest(makeContext(method, url), next as unknown as Next);
  return { response, next };
}

beforeEach(() => {
  resetRedirectCache();
});

describe('middleware redirect', () => {
  it('trả 301 cho GET không có query string', async () => {
    const { response, next } = await run('GET', OLD_PATH);
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(NEW_PATH);
    expect(next).not.toHaveBeenCalled();
  });

  it('đi tiếp khi có query string', async () => {
    const { response, next } = await run('GET', `${OLD_PATH}?dai=dong-nai`);
    expect(next).toHaveBeenCalledTimes(1);
    expect(response).toBe(NEXT);
  });

  it('đi tiếp với POST dù không có query string', async () => {
    const { response, next } = await run('POST', OLD_PATH);
    expect(next).toHaveBeenCalledTimes(1);
    expect(response).toBe(NEXT);
  });

  it('đi tiếp với HEAD (chỉ GET mới chuyển hướng)', async () => {
    const { response, next } = await run('HEAD', OLD_PATH);
    expect(next).toHaveBeenCalledTimes(1);
    expect(response).toBe(NEXT);
  });

  it('đi tiếp với GET không có redirect', async () => {
    const { response, next } = await run('GET', '/khong-ton-tai/');
    expect(next).toHaveBeenCalledTimes(1);
    expect(response).toBe(NEXT);
  });

  it('giữ nguyên trang đích khi redirect, không đệ quy thêm bước', async () => {
    const { response } = await run('GET', '/kqxs-dong-nai/');
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('/xo-so-mien-nam/dong-nai/');
  });
});

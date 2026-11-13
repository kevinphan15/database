import { defineMiddleware } from 'astro:middleware';
import { loadDataset } from './lib/data';
import { resolveRedirect } from './lib/redirects';

/** 301 một bước cho URL cũ có đích tương ứng; không chuyển hướng với tham số truy vấn. */
export const onRequest = defineMiddleware(async (context, next) => {
  if (context.request.method === 'GET' && context.url.search === '') {
    const target = await resolveRedirect(context.url.pathname);
    if (target) {
      return context.redirect(target, 301);
    }
  }

  const response = await next();

  // Deploy tối: header phủ mọi response, kể cả khi trang tự đặt meta robots khác.
  const { dataset } = await loadDataset();
  if (dataset.index_enabled) return response;

  const headers = new Headers(response.headers);
  if (!headers.has('x-robots-tag')) headers.set('x-robots-tag', 'noindex');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

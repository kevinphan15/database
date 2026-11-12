import { defineMiddleware } from 'astro:middleware';
import { resolveRedirect } from './lib/redirects';

/** 301 một bước cho URL cũ có đích tương ứng; không chuyển hướng với tham số truy vấn. */
export const onRequest = defineMiddleware(async (context, next) => {
  if (context.request.method === 'GET' && context.url.search === '') {
    const target = await resolveRedirect(context.url.pathname);
    if (target) {
      return context.redirect(target, 301);
    }
  }
  return next();
});

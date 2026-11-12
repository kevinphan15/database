import type { APIRoute } from 'astro';
import { renderRobots } from '../lib/sitemap';

export const GET: APIRoute = ({ url }) =>
  new Response(renderRobots(url.origin), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });

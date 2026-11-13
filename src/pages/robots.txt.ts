import type { APIRoute } from 'astro';
import { loadDataset } from '../lib/data';
import { renderRobots } from '../lib/sitemap';

export const GET: APIRoute = async ({ url }) => {
  const { dataset } = await loadDataset();
  return new Response(renderRobots(url.origin, dataset.index_enabled), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // Không cache: công tắc index phải có hiệu lực ngay, kể cả với crawler đang giữ bản cũ.
      'cache-control': 'no-store',
    },
  });
};

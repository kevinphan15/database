import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { loadDataset } from '../lib/data';
import { buildSitemap, renderSitemap } from '../lib/sitemap';
import { todayInVN } from '../lib/time';

export const GET: APIRoute = async ({ url }) => {
  const { dataset } = await loadDataset();
  const guides = await getCollection('guides');

  const entries = buildSitemap(dataset, {
    baseUrl: url.origin,
    today: todayInVN(),
    extraPaths: ['/huong-dan/', ...guides.map((guide) => `/huong-dan/${guide.id}/`)],
  });

  return new Response(renderSitemap(entries), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};

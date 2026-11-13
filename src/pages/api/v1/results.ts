import type { APIRoute } from 'astro';
import { loadDataset } from '../../../lib/data';
import { jsonResponse } from '../../../lib/http';
import { resultsPayload } from '../../../lib/public-api';

export const GET: APIRoute = async ({ url }) => {
  const { dataset, source } = await loadDataset();
  const limit = url.searchParams.get('limit');

  const reply = resultsPayload(dataset, {
    station: url.searchParams.get('dai'),
    date: url.searchParams.get('ngay'),
    limit: limit === null ? 20 : Number(limit),
  });

  return jsonResponse(
    { ...reply.body, source, notice: dataset.notice || null },
    reply.status,
    { 'cache-control': 'no-store' },
  );
};

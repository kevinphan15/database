import type { APIRoute } from 'astro';
import { loadDataset } from '../../../lib/data';
import { jsonResponse } from '../../../lib/http';
import { resultsPayload } from '../../../lib/public-api';

export const GET: APIRoute = async ({ url }) => {
  const { dataset, source, degraded } = await loadDataset();
  const reply = resultsPayload(dataset, {
    station: url.searchParams.get('dai'),
    date: url.searchParams.get('ngay'),
    limit: Number(url.searchParams.get('limit') ?? 20),
  });

  return jsonResponse(
    { ...reply.body, source, degraded, notice: dataset.notice || null },
    reply.status,
    { 'cache-control': 'no-store' },
  );
};

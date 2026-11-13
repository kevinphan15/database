import type { APIRoute } from 'astro';
import { loadDataset } from '../../../lib/data';
import { jsonResponse } from '../../../lib/http';
import { schedulePayload } from '../../../lib/public-api';

export const GET: APIRoute = async () => {
  const { dataset, source } = await loadDataset();
  const reply = schedulePayload(dataset, new Date().toISOString());

  return jsonResponse(
    { ...reply.body, source },
    reply.status,
    { 'cache-control': 'public, max-age=300' },
  );
};

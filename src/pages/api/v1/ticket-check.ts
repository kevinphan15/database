import type { APIRoute } from 'astro';
import { loadDataset } from '../../../lib/data';
import { jsonResponse, rateLimited, readJsonBody } from '../../../lib/http';
import { ticketCheckPayload } from '../../../lib/public-api';
import { allowTicketCheck } from '../../../lib/ratelimit';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = request.headers.get('CF-Connecting-IP') ?? clientAddress ?? 'unknown';
  const limit = await allowTicketCheck(ip);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const { dataset, source, degraded } = await loadDataset();
  const reply = ticketCheckPayload(dataset, body.value);

  return jsonResponse({ ...reply.body, source, degraded }, reply.status, {
    'cache-control': 'no-store',
  });
};

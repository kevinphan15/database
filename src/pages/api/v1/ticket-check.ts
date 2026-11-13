import type { APIRoute } from 'astro';
import { loadDataset } from '../../../lib/data';
import { jsonResponse, readJsonBody } from '../../../lib/http';
import { ticketCheckPayload } from '../../../lib/public-api';
import { allowTicketCheck } from '../../../lib/ratelimit';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = request.headers.get('CF-Connecting-IP') ?? clientAddress ?? 'unknown';
  if (!(await allowTicketCheck(`ticket:${ip}`))) {
    return jsonResponse(
      { ok: false, error: 'rate_limited', detail: 'Thử lại sau khoảng một phút.' },
      429,
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const { dataset, source } = await loadDataset();
  const reply = ticketCheckPayload(dataset, body.value);

  return jsonResponse({ ...reply.body, source }, reply.status, { 'cache-control': 'no-store' });
};

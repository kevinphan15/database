/** Trả JSON cho API nội bộ: không cache, không index. */

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, private',
      'x-robots-tag': 'noindex',
      ...extraHeaders,
    },
  });
}

/** 429 thống nhất cho mọi endpoint JSON bị chặn tần suất. */
export function rateLimited(detail = 'Quá nhiều request; thử lại sau khoảng một phút.'): Response {
  return jsonResponse({ ok: false, error: 'rate_limited', detail }, 429, { 'retry-after': '60' });
}

export async function readJsonBody(request: Request): Promise<
  { ok: true; value: unknown } | { ok: false; response: Response }
> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, response: jsonResponse({ ok: false, error: 'invalid_json' }, 400) };
  }
}

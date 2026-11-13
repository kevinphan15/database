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

export async function readJsonBody(request: Request): Promise<
  { ok: true; value: unknown } | { ok: false; response: Response }
> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, response: jsonResponse({ ok: false, error: 'invalid_json' }, 400) };
  }
}

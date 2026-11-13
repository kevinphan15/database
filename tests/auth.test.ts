import { describe, expect, it } from 'vitest';
import { authorize, parseBearer, timingSafeEqual } from '../src/lib/auth';

const INGEST = 'ingest-token-abc';
const OPERATOR = 'operator-token-xyz';

function req(authorization?: string): Request {
  return new Request('https://xoso.test/internal/v1/health', {
    headers: authorization ? { authorization } : {},
  });
}

describe('parseBearer', () => {
  it('đọc token đúng dạng', () => {
    expect(parseBearer('Bearer abc123')).toBe('abc123');
    expect(parseBearer('bearer abc123')).toBe('abc123');
  });

  it('từ chối header sai hoặc rỗng', () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer('')).toBeNull();
    expect(parseBearer('Basic abc')).toBeNull();
    expect(parseBearer('Bearer   ')).toBeNull();
  });
});

describe('timingSafeEqual', () => {
  it('bằng nhau và khác nhau', async () => {
    expect(await timingSafeEqual('abc', 'abc')).toBe(true);
    expect(await timingSafeEqual('abc', 'abd')).toBe(false);
    expect(await timingSafeEqual('abc', 'abcdef')).toBe(false);
    expect(await timingSafeEqual('', '')).toBe(true);
  });
});

describe('authorize', () => {
  const tokens = { ingestToken: INGEST, operatorToken: OPERATOR };

  it('401 khi thiếu token', async () => {
    const result = await authorize(req(), { ...tokens, require: 'ingest' });
    expect(result).toEqual({ ok: false, status: 401, error: 'missing_bearer_token' });
  });

  it('401 khi token sai', async () => {
    const result = await authorize(req('Bearer sai-token'), { ...tokens, require: 'ingest' });
    expect(result).toEqual({ ok: false, status: 401, error: 'invalid_token' });
  });

  it('nhận ingest token cho quyền ingest', async () => {
    const result = await authorize(req(`Bearer ${INGEST}`), { ...tokens, require: 'ingest' });
    expect(result).toEqual({ ok: true, role: 'ingest' });
  });

  it('403 khi ingest token đòi quyền operator', async () => {
    const result = await authorize(req(`Bearer ${INGEST}`), { ...tokens, require: 'operator' });
    expect(result).toEqual({ ok: false, status: 403, error: 'operator_token_required' });
  });

  it('operator token làm được cả hai quyền', async () => {
    expect(await authorize(req(`Bearer ${OPERATOR}`), { ...tokens, require: 'operator' })).toEqual({
      ok: true,
      role: 'operator',
    });
    expect(await authorize(req(`Bearer ${OPERATOR}`), { ...tokens, require: 'ingest' })).toEqual({
      ok: true,
      role: 'operator',
    });
  });

  it('403 khi chưa cấu hình token nào (API đóng)', async () => {
    const result = await authorize(req('Bearer bat-ky'), { require: 'ingest' });
    expect(result).toEqual({ ok: false, status: 403, error: 'internal_api_disabled' });
  });

  it('401 khi chỉ cấu hình operator token mà gửi token lạ', async () => {
    const result = await authorize(req(`Bearer ${INGEST}`), {
      operatorToken: OPERATOR,
      require: 'ingest',
    });
    expect(result).toEqual({ ok: false, status: 401, error: 'invalid_token' });
  });
});

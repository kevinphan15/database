/**
 * API công khai không được cache: payload chứa `generated_at`, `next_draw_at_utc` và `degraded`
 * tính theo lúc gọi, nên một cửa sổ max-age chỉ làm client thấy số liệu cũ.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Dataset } from '../src/lib/types';

const EMPTY: Dataset = {
  notice: '',
  is_fixture: false,
  index_enabled: true,
  product_code: 'xs-mn',
  prize_rule_version: 1,
  regions: [],
  stations: [],
  prize_rules: [],
  schedule: [],
  exceptions: [],
  draws: [],
};

vi.mock('../src/lib/data', () => ({
  loadDataset: async () => ({ dataset: EMPTY, source: 'd1', degraded: false }),
  resetDataCache: () => {},
}));

import { GET as scheduleGET } from '../src/pages/api/v1/schedule';
import { GET as resultsGET } from '../src/pages/api/v1/results';

async function headers(get: unknown) {
  const response = await (get as (context: { url: URL }) => Promise<Response>)({
    url: new URL('https://xoso.test/api/v1/schedule/'),
  });
  return { status: response.status, cacheControl: response.headers.get('cache-control') ?? '' };
}

describe('cache-control của API công khai', () => {
  it('/api/v1/schedule/ trả no-store', async () => {
    const { status, cacheControl } = await headers(scheduleGET);
    expect(status).toBe(200);
    expect(cacheControl).toBe('no-store');
  });

  it('/api/v1/results/ trả no-store', async () => {
    const { cacheControl } = await headers(resultsGET);
    expect(cacheControl).toBe('no-store');
  });
});

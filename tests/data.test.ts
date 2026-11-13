/**
 * D1 có mặt nghĩa là production: rỗng hay lỗi thì trả trang trống, TUYỆT ĐỐI không rơi về fixture
 * (số giả trên domain thật). Fixture chỉ dùng khi Worker không có binding D1.
 */

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('cloudflare:workers', () => ({
  get env() {
    return state.db ? { DB: state.db } : {};
  },
}));

import { loadDataset, resetDataCache } from '../src/lib/data';

const SCHEMA = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');

/** D1 tối giản: chỉ đủ những gì loadFromD1/readFlags gọi (đều là prepare().all()). */
function makeD1(options: { failOn?: string } = {}) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(SCHEMA);
  return {
    prepare(sql: string) {
      if (options.failOn && sql.includes(options.failOn)) throw new Error('D1 lỗi giả lập');
      return {
        all: async () => ({ results: raw.prepare(sql).all() as unknown[] }),
      };
    },
  };
}

describe('loadDataset', () => {
  beforeEach(() => {
    resetDataCache();
    state.db = null;
  });

  it('không có binding D1 → fixture có nhãn dữ liệu mẫu', async () => {
    const { dataset, source } = await loadDataset();
    expect(source).toBe('fixture');
    expect(dataset.is_fixture).toBe(true);
    expect(dataset.stations.length).toBeGreaterThan(0);
  });

  it('D1 rỗng (đã migrate, chưa có dữ liệu) → dataset rỗng, không lộ fixture', async () => {
    state.db = makeD1();
    const { dataset, source } = await loadDataset();
    expect(source).toBe('d1');
    expect(dataset.is_fixture).toBe(false);
    expect(dataset.notice).toBe('');
    expect(dataset.stations).toEqual([]);
    expect(dataset.draws).toEqual([]);
    expect(dataset.regions).toEqual([]);
    // Thiếu hàng index_enabled nghĩa là đang bật; trang sẽ tự rỗng vì không có dữ liệu.
    expect(dataset.index_enabled).toBe(true);
  });

  it('D1 lỗi → dataset rỗng, không rơi về dữ liệu mẫu', async () => {
    state.db = makeD1({ failOn: 'FROM stations' });
    const { dataset } = await loadDataset();
    expect(dataset.is_fixture).toBe(false);
    expect(dataset.stations).toEqual([]);
  });
});

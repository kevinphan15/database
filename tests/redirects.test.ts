import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  rows: new Map<string, string>(),
  fail: false,
  calls: 0,
}));

vi.mock('cloudflare:workers', () => ({
  env: {
    DB: {
      prepare: () => ({
        bind: (path: string) => ({
          first: async () => {
            db.calls += 1;
            if (db.fail) throw new Error('D1 lỗi (giả lập)');
            const target = db.rows.get(path);
            return target ? { new_path: target } : null;
          },
        }),
      }),
    },
  },
}));

import { resetRedirectCache, resolveRedirect } from '../src/lib/redirects';

beforeEach(() => {
  db.rows.clear();
  db.fail = false;
  db.calls = 0;
  resetRedirectCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveRedirect', () => {
  it('dùng bản đồ tĩnh khi D1 không có dòng nào', async () => {
    expect(await resolveRedirect('/kqxs-mien-nam/')).toBe('/xo-so-mien-nam/');
    expect(await resolveRedirect('/kqxs-dong-nai/')).toBe('/xo-so-mien-nam/dong-nai/');
    expect(await resolveRedirect('/do-ve/')).toBe('/do-ve-so/');
  });

  it('đọc được dòng trong bảng redirects của D1', async () => {
    db.rows.set('/xo-so-dong-nai/', '/xo-so-mien-nam/dong-nai/');
    expect(await resolveRedirect('/xo-so-dong-nai/')).toBe('/xo-so-mien-nam/dong-nai/');
    expect(db.calls).toBe(1);
  });

  it('D1 thắng bản đồ tĩnh khi cùng đường dẫn', async () => {
    db.rows.set('/lich-xo-so/', '/xo-so-mien-nam/');
    expect(await resolveRedirect('/lich-xo-so/')).toBe('/xo-so-mien-nam/');
  });

  it('rơi về bản đồ tĩnh khi D1 lỗi', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = true;
    expect(await resolveRedirect('/kqxs-mien-nam/')).toBe('/xo-so-mien-nam/');
    expect(spy).toHaveBeenCalled();
  });

  it('không chuyển hướng đường dẫn lạ', async () => {
    expect(await resolveRedirect('/khong-ton-tai/')).toBeNull();
    db.rows.set('/khac/', '/xo-so-mien-nam/');
    expect(await resolveRedirect('/khac/')).toBe('/xo-so-mien-nam/');
  });

  it('cache kết quả, không hỏi D1 lần hai', async () => {
    db.rows.set('/xo-so-dong-nai/', '/xo-so-mien-nam/dong-nai/');
    await resolveRedirect('/xo-so-dong-nai/');
    await resolveRedirect('/xo-so-dong-nai/');
    expect(db.calls).toBe(1);

    db.calls = 0;
    await resolveRedirect('/khong-ton-tai/');
    await resolveRedirect('/khong-ton-tai/');
    expect(db.calls).toBe(1);
  });

  it('resetRedirectCache buộc đọc lại D1', async () => {
    db.rows.set('/xo-so-dong-nai/', '/xo-so-mien-nam/dong-nai/');
    await resolveRedirect('/xo-so-dong-nai/');
    resetRedirectCache();
    db.rows.set('/xo-so-dong-nai/', '/lich-mo-thuong/');
    expect(await resolveRedirect('/xo-so-dong-nai/')).toBe('/lich-mo-thuong/');
    expect(db.calls).toBe(2);
  });
});

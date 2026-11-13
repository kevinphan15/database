/** Công tắc vận hành: parse body publish-mode + đọc/ghi bảng settings trên SQLite thật. */

import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { parseFlagUpdates, readFlags, writeFlags } from '../src/lib/settings';

class Stmt {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): Stmt {
    return new Stmt(this.db, this.sql, params);
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...(this.params as never[])) as T[] };
  }

  run(): { success: true; meta: { changes: number } } {
    const result = this.db.prepare(this.sql).run(...(this.params as never[]));
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class FakeDb {
  readonly raw = new DatabaseSync(':memory:');

  constructor() {
    this.raw.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }

  prepare(sql: string): Stmt {
    return new Stmt(this.raw, sql);
  }

  async batch(statements: Stmt[]): Promise<{ success: true; meta: { changes: number } }[]> {
    return statements.map((statement) => statement.run());
  }

  value(key: string): string | null {
    const row = this.raw.prepare('SELECT value AS v FROM settings WHERE key = ?').get(key) as
      | { v: string }
      | undefined;
    return row?.v ?? null;
  }
}

const asDb = (db: FakeDb) => db as unknown as D1Database;

describe('parseFlagUpdates', () => {
  it('nhận một hoặc cả hai cờ', () => {
    expect(parseFlagUpdates({ publish_enabled: false })).toEqual({
      ok: true,
      updates: [{ key: 'publish_enabled', enabled: false }],
    });
    expect(parseFlagUpdates({ index_enabled: true, publish_enabled: '0' })).toEqual({
      ok: true,
      updates: [
        { key: 'publish_enabled', enabled: false },
        { key: 'index_enabled', enabled: true },
      ],
    });
  });

  it('nhận 1/0 như bản cũ', () => {
    expect(parseFlagUpdates({ index_enabled: 1 })).toEqual({
      ok: true,
      updates: [{ key: 'index_enabled', enabled: true }],
    });
    expect(parseFlagUpdates({ index_enabled: 0 })).toEqual({
      ok: true,
      updates: [{ key: 'index_enabled', enabled: false }],
    });
  });

  it('422 khi không có cờ nào hoặc sai kiểu', () => {
    expect(parseFlagUpdates({})).toMatchObject({ ok: false });
    expect(parseFlagUpdates({ index_enabled: 'tat' })).toMatchObject({ ok: false });
    expect(parseFlagUpdates({ index_enabled: null })).toMatchObject({ ok: false });
  });

  it('bỏ qua khoá lạ, không tự bật/tắt hộ', () => {
    expect(parseFlagUpdates({ publish_enabled: true, khac: false })).toEqual({
      ok: true,
      updates: [{ key: 'publish_enabled', enabled: true }],
    });
  });
});

describe('readFlags / writeFlags', () => {
  it('thiếu hàng thì coi như đang bật', async () => {
    expect(await readFlags(asDb(new FakeDb()))).toEqual({
      publish_enabled: true,
      index_enabled: true,
    });
  });

  it('ghi được khi hàng chưa tồn tại và cập nhật khi đã có', async () => {
    const db = new FakeDb();
    expect(await writeFlags(asDb(db), [{ key: 'index_enabled', enabled: false }])).toBe(true);
    expect(db.value('index_enabled')).toBe('0');

    expect(
      await writeFlags(asDb(db), [
        { key: 'index_enabled', enabled: true },
        { key: 'publish_enabled', enabled: false },
      ]),
    ).toBe(true);
    expect(db.value('index_enabled')).toBe('1');
    expect(db.value('publish_enabled')).toBe('0');
    expect(await readFlags(asDb(db))).toEqual({ publish_enabled: false, index_enabled: true });
  });

  it('đọc lại thấy ngay giá trị vừa ghi (không qua cache)', async () => {
    const db = new FakeDb();
    expect((await readFlags(asDb(db))).index_enabled).toBe(true);
    await writeFlags(asDb(db), [{ key: 'index_enabled', enabled: false }]);
    expect((await readFlags(asDb(db))).index_enabled).toBe(false);
  });
});

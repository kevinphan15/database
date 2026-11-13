/**
 * Khoá lại chuỗi migration dành cho production: chạy toàn bộ migrations/*.sql trên SQLite sạch
 * (không seed) rồi kiểm số bảng, số nguồn và việc không có dòng dữ liệu mẫu nào.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_URL = new URL('../migrations/', import.meta.url);

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  const files = readdirSync(MIGRATIONS_URL)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(new URL(file, MIGRATIONS_URL), 'utf8'));
  }
  return db;
}

function count(db: DatabaseSync, sql: string): number {
  const row = db.prepare(sql).get() as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

describe('chuỗi migration production (không seed)', () => {
  const db = freshDb();

  it('tạo đủ 15 bảng và 4 chỉ mục', () => {
    expect(count(db, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).toBe(15);
    expect(count(db, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")).toBe(4);
  });

  it('có đúng 2 nguồn thật, cờ authoritative đúng', () => {
    expect(count(db, 'SELECT COUNT(*) AS n FROM sources')).toBe(2);

    const rows = db
      .prepare('SELECT source_id, kind, is_authoritative FROM sources ORDER BY source_id')
      .all() as { source_id: string; kind: string; is_authoritative: number }[];

    expect(rows).toEqual([
      { source_id: 'src-live', kind: 'scrape', is_authoritative: 0 },
      { source_id: 'src-official', kind: 'official', is_authoritative: 1 },
    ]);
  });

  it('chỉ có dữ liệu tham chiếu, không có kỳ quay hay số trúng nào', () => {
    const expected: Record<string, number> = {
      regions: 1,
      stations: 1,
      station_aliases: 2,
      products: 1,
      prize_rules: 9,
      schedule_rules: 1,
      schedule_exceptions: 0,
      draws: 0,
      result_revisions: 0,
      ingest_events: 0,
      index_policy: 0,
      redirects: 0,
      stats_snapshots: 0,
      settings: 0,
    };

    for (const [table, rows] of Object.entries(expected)) {
      expect({ table, rows: count(db, `SELECT COUNT(*) AS n FROM ${table}`) }).toEqual({ table, rows });
    }

    // Lịch quay trỏ tới nguồn thật, không phải nguồn mẫu.
    const schedule = db
      .prepare('SELECT source_id, iso_weekday, local_time FROM schedule_rules')
      .all() as { source_id: string; iso_weekday: number; local_time: string }[];
    expect(schedule).toEqual([{ source_id: 'src-official', iso_weekday: 3, local_time: '16:10' }]);
  });

  it('chạy lại toàn bộ migration là idempotent, không nhân đôi nguồn', () => {
    const again = freshDb();
    for (const file of readdirSync(MIGRATIONS_URL).filter((name) => name.endsWith('.sql'))) {
      again.exec(readFileSync(new URL(file, MIGRATIONS_URL), 'utf8'));
    }
    expect(count(again, 'SELECT COUNT(*) AS n FROM sources')).toBe(2);
  });
});

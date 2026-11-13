/**
 * Nguồn dữ liệu của website.
 * - Có binding D1: luôn đọc D1, kể cả khi rỗng — trang sẽ hiển thị trạng thái rỗng.
 *   Lỗi D1 cũng trả dataset rỗng: thà trang trống còn hơn hiện số giả trên domain thật.
 * - Không có binding D1 (dev thuần): dùng fixture và hiển thị nhãn "dữ liệu mẫu".
 */

import { fixtureDataset } from './fixture';
import { loadFromD1 } from './queries';
import { readFlags } from './settings';
import type { Dataset, DataSource } from './types';

export interface LoadedData {
  dataset: Dataset;
  source: DataSource;
}

let cached: LoadedData | null = null;

async function getDb(): Promise<D1Database | null> {
  try {
    const mod = (await import('cloudflare:workers')) as { env?: { DB?: D1Database } };
    return mod.env?.DB ?? null;
  } catch {
    return null;
  }
}

export async function loadDataset(): Promise<LoadedData> {
  const db = await getDb();
  const base = await loadBase(db);

  // Công tắc index đọc lại mỗi request (một khoá chính) thay vì theo cache của isolate,
  // để tắt index có hiệu lực ngay.
  return { source: base.source, dataset: { ...base.dataset, index_enabled: await readIndexEnabled(db) } };
}

async function readIndexEnabled(db: D1Database | null): Promise<boolean> {
  if (!db) return fixtureDataset.index_enabled;
  try {
    return (await readFlags(db)).index_enabled;
  } catch (error) {
    console.error('[data] không đọc được công tắc index, coi như đang bật:', error);
    return true;
  }
}

function emptyDataset(): Dataset {
  return {
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
}

async function loadBase(db: D1Database | null): Promise<LoadedData> {
  if (cached) return cached;

  if (!db) {
    cached = { dataset: fixtureDataset, source: 'fixture' };
    return cached;
  }

  try {
    cached = { dataset: await loadFromD1(db), source: 'd1' };
  } catch (error) {
    console.error('[data] không đọc được D1, trả trang rỗng thay vì dữ liệu mẫu:', error);
    cached = { dataset: emptyDataset(), source: 'd1' };
  }
  return cached;
}

/** Dùng trong test để bỏ cache. */
export function resetDataCache(): void {
  cached = null;
}

/**
 * Nguồn dữ liệu của website.
 * - Có binding D1: luôn đọc D1, kể cả khi rỗng — trang sẽ hiển thị trạng thái rỗng.
 *   Lỗi D1 cũng trả dataset rỗng: thà trang trống còn hơn hiện số giả trên domain thật.
 * - Không có binding D1 (dev thuần): dùng fixture và hiển thị nhãn "dữ liệu mẫu".
 */

import { DATA_UNAVAILABLE_NOTICE } from './degraded';
import { fixtureDataset } from './fixture';
import { loadFromD1 } from './queries';
import { readFlags } from './settings';
import type { Dataset, DataSource } from './types';

export interface LoadedData {
  dataset: Dataset;
  source: DataSource;
  /** D1 lỗi truy vấn (không phải rỗng): trang phải báo lỗi tạm thời, không được giả vờ “chưa có dữ liệu”. */
  degraded: boolean;
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
  return {
    source: base.source,
    degraded: base.degraded,
    dataset: { ...base.dataset, index_enabled: await readIndexEnabled(db) },
  };
}

async function readIndexEnabled(db: D1Database | null): Promise<boolean> {
  if (!db) return fixtureDataset.index_enabled;
  try {
    return (await readFlags(db)).index_enabled;
  } catch (error) {
    // Không đọc được công tắc thì phải coi như ĐANG TẮT: deploy tối không được tự mở index
    // chỉ vì D1 lỗi. (Thiếu hàng trong settings vẫn là bật — xem readFlags.)
    console.error('[data] không đọc được công tắc index, coi như đang tắt:', error);
    return false;
  }
}

const EMPTY_DATASET: Dataset = {
  notice: '',
  is_fixture: false,
  // Trạng thái an toàn nếu dataset này lọt ra ngoài: `loadDataset` luôn ghi đè bằng giá trị
  // trong `settings`, nhưng không để mặc định mở index ở đây.
  index_enabled: false,
  product_code: 'xs-mn',
  prize_rule_version: 1,
  regions: [],
  stations: [],
  prize_rules: [],
  schedule: [],
  exceptions: [],
  draws: [],
};

async function loadBase(db: D1Database | null): Promise<LoadedData> {
  if (cached) return cached;

  if (!db) {
    cached = { dataset: fixtureDataset, source: 'fixture', degraded: false };
    return cached;
  }

  try {
    cached = { dataset: await loadFromD1(db), source: 'd1', degraded: false };
  } catch (error) {
    console.error('[data] không đọc được D1, trả trang rỗng thay vì dữ liệu mẫu:', error);
    cached = {
      dataset: { ...EMPTY_DATASET, notice: DATA_UNAVAILABLE_NOTICE },
      source: 'd1',
      degraded: true,
    };
  }
  return cached;
}

/** Dùng trong test để bỏ cache. */
export function resetDataCache(): void {
  cached = null;
}

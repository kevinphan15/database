/**
 * Nguồn dữ liệu của website.
 * - Nếu Worker có binding D1 và D1 có dữ liệu: đọc D1.
 * - Ngược lại (dev không có binding, D1 rỗng, hoặc lỗi): dùng fixture và hiển thị nhãn "dữ liệu mẫu".
 */

import { fixtureDataset } from './fixture';
import { loadFromD1 } from './queries';
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
  if (cached) return cached;

  const db = await getDb();
  if (db) {
    try {
      const dataset = await loadFromD1(db);
      if (dataset.stations.length > 0 && dataset.draws.length > 0) {
        cached = { dataset, source: 'd1' };
        return cached;
      }
    } catch (error) {
      console.error('[data] không đọc được D1, tạm dùng fixture:', error);
    }
  }

  cached = { dataset: fixtureDataset, source: 'fixture' };
  return cached;
}

/** Dùng trong test để bỏ cache. */
export function resetDataCache(): void {
  cached = null;
}

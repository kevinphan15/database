/**
 * Nguồn dữ liệu của website.
 * - Nếu Worker có binding D1 và D1 có dữ liệu: đọc D1.
 * - Ngược lại (dev không có binding, D1 rỗng, hoặc lỗi): dùng fixture và hiển thị nhãn "dữ liệu mẫu".
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

async function loadBase(db: D1Database | null): Promise<LoadedData> {
  if (cached) return cached;

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

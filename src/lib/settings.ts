/** Công tắc vận hành trong bảng settings, đổi được từ /internal/v1/publish-mode/. */

export type FlagKey = 'publish_enabled' | 'index_enabled';

const FLAG_KEYS: FlagKey[] = ['publish_enabled', 'index_enabled'];

export interface FlagUpdate {
  key: FlagKey;
  enabled: boolean;
}

export type FlagParseResult = { ok: true; updates: FlagUpdate[] } | { ok: false; detail: string };

function parseFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return null;
}

/** Body → danh sách cập nhật; phải có ít nhất một cờ và không cờ nào sai kiểu. */
export function parseFlagUpdates(raw: Record<string, unknown>): FlagParseResult {
  const updates: FlagUpdate[] = [];
  for (const key of FLAG_KEYS) {
    if (!(key in raw)) continue;
    const enabled = parseFlag(raw[key]);
    if (enabled === null) return { ok: false, detail: `${key}: cần true|false (hoặc 1|0).` };
    updates.push({ key, enabled });
  }
  if (updates.length === 0) {
    return { ok: false, detail: 'Cần publish_enabled và/hoặc index_enabled.' };
  }
  return { ok: true, updates };
}

/** Giá trị hiện tại của cả hai công tắc; thiếu hàng nghĩa là đang bật. */
export async function readFlags(db: D1Database): Promise<Record<FlagKey, boolean>> {
  const rows = await db
    .prepare("SELECT key, value FROM settings WHERE key IN ('publish_enabled', 'index_enabled')")
    .all<{ key: string; value: string }>();
  const values = new Map((rows.results ?? []).map((row) => [row.key, row.value]));
  return {
    publish_enabled: values.get('publish_enabled') !== '0',
    index_enabled: values.get('index_enabled') !== '0',
  };
}

/** Ghi các công tắc trong một batch; false nếu có lệnh không đổi được dòng nào. */
export async function writeFlags(db: D1Database, updates: FlagUpdate[]): Promise<boolean> {
  const statements = updates.map((update) =>
    db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .bind(update.key, update.enabled ? '1' : '0'),
  );
  const results = await db.batch(statements);
  return results.length === updates.length && results.every((result) => (result.meta?.changes ?? 0) > 0);
}

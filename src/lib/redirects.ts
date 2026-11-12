/**
 * Chuyển hướng 301 cho URL cũ.
 * Ưu tiên bảng `redirects` trong D1; nếu không có D1 thì dùng bản đồ tĩnh dưới đây.
 */

const STATIC_REDIRECTS: Record<string, string> = {
  '/kqxs-mien-nam/': '/xo-so-mien-nam/',
  '/ket-qua-xo-so-mien-nam/': '/xo-so-mien-nam/',
  '/kqxs-dong-nai/': '/xo-so-mien-nam/dong-nai/',
  '/lich-xo-so/': '/lich-mo-thuong/',
  '/do-ve/': '/do-ve-so/',
};

const cache = new Map<string, string | null>();

/** Dùng trong test để bỏ cache giữa các ca. */
export function resetRedirectCache(): void {
  cache.clear();
}

async function getDb(): Promise<D1Database | null> {
  try {
    const mod = (await import('cloudflare:workers')) as { env?: { DB?: D1Database } };
    return mod.env?.DB ?? null;
  } catch {
    return null;
  }
}

export async function resolveRedirect(pathname: string): Promise<string | null> {
  if (cache.has(pathname)) return cache.get(pathname) ?? null;

  const db = await getDb();
  if (db) {
    try {
      const row = await db
        .prepare('SELECT new_path FROM redirects WHERE old_path = ?1')
        .bind(pathname)
        .first<{ new_path: string }>();
      if (row?.new_path) {
        cache.set(pathname, row.new_path);
        return row.new_path;
      }
    } catch (error) {
      console.error('[redirects] không đọc được bảng redirects:', error);
    }
  }

  const target = STATIC_REDIRECTS[pathname] ?? null;
  cache.set(pathname, target);
  return target;
}

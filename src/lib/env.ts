/** Đọc binding/secret của Worker. Trả về object rỗng khi chạy ngoài runtime Cloudflare. */

interface AppEnv {
  DB?: D1Database;
  INGEST_TOKEN?: string;
  OPERATOR_TOKEN?: string;
}

export async function getEnv(): Promise<AppEnv> {
  try {
    const mod = (await import('cloudflare:workers')) as { env?: AppEnv };
    return mod.env ?? {};
  } catch {
    return {};
  }
}

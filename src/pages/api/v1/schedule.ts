import type { APIRoute } from 'astro';
import { loadDataset } from '../../../lib/data';
import { jsonResponse } from '../../../lib/http';
import { schedulePayload } from '../../../lib/public-api';

export const GET: APIRoute = async () => {
  const { dataset, source, degraded } = await loadDataset();
  const reply = schedulePayload(dataset, new Date().toISOString());

  // `generated_at`, `next_draw_at_utc` và `degraded` đều tính theo lúc gọi; cache 5 phút chỉ làm
  // client thấy số liệu cũ mà gần như không tiết kiệm gì. Đồng bộ với các API còn lại: no-store.
  return jsonResponse({ ...reply.body, source, degraded }, reply.status, { 'cache-control': 'no-store' });
};

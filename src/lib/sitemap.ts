/**
 * Sinh sitemap từ dữ liệu D1/fixture.
 * Chỉ liệt kê URL canonical trả 200 và đủ điều kiện index:
 * - trang nội dung chính
 * - trang ngày có dữ liệu, trong cửa sổ N ngày gần nhất (mặc định 90)
 * Không bao giờ: tham số lọc, kết quả dò vé, trang thống kê chưa duyệt.
 */

import { addDays } from './time';
import type { Dataset } from './types';

export interface SitemapEntry {
  path: string;
  lastmod?: string;
}

export interface SitemapOptions {
  baseUrl: string;
  today: string;
  windowDays?: number;
  /** Đường dẫn bổ sung đã được duyệt (ví dụ bài hướng dẫn). */
  extraPaths?: string[];
}

export function buildSitemap(ds: Dataset, options: SitemapOptions): SitemapEntry[] {
  // Deploy tối: công tắc tắt thì sitemap rỗng, không liệt kê URL nào.
  if (!ds.index_enabled) return [];

  const { baseUrl, today, windowDays = 90, extraPaths = [] } = options;
  const from = addDays(today, -windowDays);
  const entries: SitemapEntry[] = [];
  const push = (path: string, lastmod?: string) => {
    entries.push({ path, lastmod });
  };

  push(`${baseUrl}/`);
  push(`${baseUrl}/lich-mo-thuong/`);
  push(`${baseUrl}/so-ket-qua/`);
  push(`${baseUrl}/do-ve-so/`);
  for (const path of extraPaths) push(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);

  for (const region of ds.regions) {
    const regionPath = `${baseUrl}/xo-so-${region.slug}/`;
    push(regionPath);

    for (const station of ds.stations.filter((s) => s.region_code === region.code)) {
      push(`${baseUrl}/xo-so-${region.slug}/${station.slug}/`);

      const draws = ds.draws
        .filter(
          (draw) =>
            draw.station_code === station.station_code &&
            draw.draw_date >= from &&
            draw.draw_date <= today &&
            Object.keys(draw.prizes).length > 0,
        )
        .sort((a, b) => b.draw_date.localeCompare(a.draw_date));

      for (const draw of draws) {
        push(`${baseUrl}/xo-so-${region.slug}/${station.slug}/${draw.draw_date}/`, draw.updated_at);
      }
    }
  }

  // Khử trùng lặp, giữ lastmod mới nhất.
  const map = new Map<string, SitemapEntry>();
  for (const entry of entries) {
    const existing = map.get(entry.path);
    if (!existing || (entry.lastmod ?? '') > (existing.lastmod ?? '')) {
      map.set(entry.path, entry);
    }
  }
  return [...map.values()];
}

export function renderSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) =>
      [
        '  <url>',
        `    <loc>${escapeXml(entry.path)}</loc>`,
        entry.lastmod ? `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : null,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** robots.txt: chặn URL sinh bởi tham số, trỏ tới sitemap; tắt index thì chặn toàn bộ. */
export function renderRobots(baseUrl: string, indexEnabled = true): string {
  if (!indexEnabled) {
    return `User-agent: *
Disallow: /
`;
  }

  return `User-agent: *
Allow: /
# Bộ lọc và tham số không có nhu cầu tìm kiếm: chặn crawl để không sinh URL rỗng.
Disallow: /*?tu-ngay=
Disallow: /*?den-ngay=
Disallow: /*?page=
Disallow: /*?dai=
Disallow: /*?station=
Disallow: /*?so=
# API nội bộ cho n8n và API JSON công khai: không cho crawl.
Disallow: /internal/
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
`;
}

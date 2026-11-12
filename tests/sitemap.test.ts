import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../src/lib/fixture';
import { buildSitemap, renderRobots, renderSitemap } from '../src/lib/sitemap';

const baseUrl = 'https://xoso.test';

function paths(today: string, extraPaths: string[] = []): string[] {
  return buildSitemap(fixtureDataset, { baseUrl, today, extraPaths }).map((entry) => entry.path);
}

describe('buildSitemap', () => {
  it('có các trang nội dung chính', () => {
    const list = paths('2026-11-12');
    expect(list).toContain(`${baseUrl}/`);
    expect(list).toContain(`${baseUrl}/xo-so-mien-nam/`);
    expect(list).toContain(`${baseUrl}/xo-so-mien-nam/dong-nai/`);
    expect(list).toContain(`${baseUrl}/lich-mo-thuong/`);
    expect(list).toContain(`${baseUrl}/so-ket-qua/`);
    expect(list).toContain(`${baseUrl}/do-ve-so/`);
  });

  it('có trang ngày trong cửa sổ và có dữ liệu', () => {
    const list = paths('2026-11-12');
    expect(list).toContain(`${baseUrl}/xo-so-mien-nam/dong-nai/2026-11-04/`);
    expect(list).toContain(`${baseUrl}/xo-so-mien-nam/dong-nai/2026-11-11/`);
  });

  it('loại trang ngày ngoài cửa sổ 90 ngày', () => {
    const list = paths('2027-06-01');
    expect(list.some((path) => /\/2026-11-04\/$/.test(path))).toBe(false);
    // nhưng trang danh mục vẫn còn
    expect(list).toContain(`${baseUrl}/xo-so-mien-nam/dong-nai/`);
  });

  it('không chứa thống kê, kết quả dò vé hay URL có tham số', () => {
    const list = paths('2026-11-12');
    expect(list.some((path) => path.includes('/thong-ke/'))).toBe(false);
    expect(list.some((path) => path.includes('?'))).toBe(false);
    expect(list.some((path) => path.includes('/do-ve-so/?'))).toBe(false);
  });

  it('nhận thêm đường dẫn bài hướng dẫn', () => {
    const list = paths('2026-11-12', ['/huong-dan/cach-do-ve-so/']);
    expect(list).toContain(`${baseUrl}/huong-dan/cach-do-ve-so/`);
  });

  it('khử trùng lặp', () => {
    const list = paths('2026-11-12');
    expect(new Set(list).size).toBe(list.length);
  });
});

describe('renderSitemap', () => {
  it('sinh XML hợp lệ và escape ký tự đặc biệt', () => {
    const xml = renderSitemap([
      { path: 'https://xoso.test/a?b=1&c=2' },
      { path: 'https://xoso.test/xo-so-mien-nam/dong-nai/', lastmod: '2026-11-04T09:40:00Z' },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('<lastmod>2026-11-04T09:40:00Z</lastmod>');
    expect(xml).toContain('</urlset>');
  });
});

describe('renderRobots', () => {
  it('chặn tham số lọc và trỏ sitemap', () => {
    const txt = renderRobots(baseUrl);
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Disallow: /*?dai=');
    expect(txt).toContain('Disallow: /*?tu-ngay=');
    expect(txt).toContain(`Sitemap: ${baseUrl}/sitemap.xml`);
    expect(txt).not.toContain('Disallow: /\n');
  });
});

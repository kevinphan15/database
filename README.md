# database — Website kết quả xổ số

Astro 7 (SSR) trên Cloudflare Workers + D1. Kế hoạch đầy đủ: [`docs/plan.md`](docs/plan.md).
Nội quy kỹ thuật: [`AGENTS.md`](AGENTS.md).

## Chạy local

```bash
npm install
npm run dev          # http://localhost:4321
npm test             # vitest
npm run build        # astro build → dist/
```

Khi chưa có binding D1, website tự dùng fixture (`src/data/fixture.json`) và hiển thị nhãn
**DỮ LIỆU MẪU**.

## D1 local

```bash
npm run db:local:init   # tạo schema (migrations/0001_init.sql)
npm run db:local:seed   # dữ liệu mẫu (migrations/0002_seed.sql)
```

Sau khi seed, `wrangler dev`/`astro dev` có binding `DB` sẽ đọc dữ liệu từ D1 local thay vì fixture.

## Cấu trúc

```
src/pages/       trang SSR: chủ, miền, đài, ngày, sổ kết quả, thống kê, dò vé, hướng dẫn,
                 sitemap.xml, robots.txt, 404
src/components/  PrizeTable, StatusBadge, ScheduleTable, DateBody, StationBody
src/content/     bài hướng dẫn (content collection `guides`)
src/layouts/     Base.astro (canonical + meta robots)
src/lib/         time (giờ VN), format, policy (index), selectors, queries (D1), fixture,
                 ticket (dò vé), stats, sitemap, redirects, ratelimit
migrations/      schema + seed
tests/           vitest
docs/plan.md     kế hoạch tổng thể
```

## Trạng thái

- ✅ Chặng 1: schema D1, fixture Đồng Nai (2 kỳ: đã xác nhận + thiếu giải), 4 trang SSR, test, CI
- ✅ Chặng 2: trang ngày, sổ kết quả, thống kê, dò vé bằng POST, hướng dẫn, sitemap/robots từ dữ liệu,
  redirects 301, 404 cho ngày không quay (56 test)

## Luật index đang áp dụng

| Nhóm URL | robots | canonical |
|---|---|---|
| `/`, miền, đài, `/lich-mo-thuong/`, `/so-ket-qua/`, `/do-ve-so/`, `/huong-dan/*` | `index, follow` | self |
| Trang ngày (kể cả hôm nay) | `index, follow` khi đã có số | self |
| `/thong-ke/giai-dac-biet/` | `noindex, follow` | self |
| Kết quả dò vé (POST cùng URL) | `X-Robots-Tag: noindex, follow` + `no-store` | — |
| Trang 404 | `noindex, nofollow` | **không phát thẻ canonical** |

`/do-ve-so/` dùng POST nên không sinh URL kết quả; tham số lọc bị chặn trong `robots.txt` bằng
wildcard (`?dai=`, `?page=`, `?tu-ngay=`, …).
- ⏳ Chặng 3: ingest + luật xác nhận tự động + workflow n8n
- ⏳ Chặng 4: tạo D1 thật, subdomain, Workers Builds, deploy tối, bật index

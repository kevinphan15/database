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
npm run db:local:init     # schema + chỉ mục (migrations/0001_init.sql)
npm run db:local:seed     # dữ liệu mẫu, chỉ local (seed/fixture.sql)
```

Sau khi seed, `wrangler dev`/`astro dev` có binding `DB` sẽ đọc dữ liệu từ D1 local thay vì fixture.

## Cấu trúc

```
src/pages/       trang SSR: chủ, miền, đài, ngày, sổ kết quả, thống kê, dò vé, hướng dẫn,
                 sitemap.xml, robots.txt, 404
src/pages/internal/v1/  API cho n8n (observations, schedule-sync, publish-mode, health)
src/pages/api/v1/       API đọc công khai (results, schedule, ticket-check)
src/components/  PrizeTable, StatusBadge, ScheduleTable, DateBody, StationBody
src/content/     bài hướng dẫn (content collection `guides`)
src/layouts/     Base.astro (canonical + meta robots)
src/lib/         time (giờ VN), format, policy (index), selectors, queries (D1), fixture,
                 ticket (dò vé), stats, sitemap, redirects, ratelimit, ingest (luật A),
                 ingest-store (ghi D1), auth, schedule-sync, public-api, http, env
n8n/             4 workflow JSON + hướng dẫn import
migrations/      schema + chỉ mục (0001_init.sql) — an toàn chạy trên D1 thật
seed/            dữ liệu mẫu local — không bao giờ chạy lên D1 thật
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

## API nội bộ cho n8n

Tất cả dưới `/internal/v1/`, yêu cầu `Authorization: Bearer <token>`, trả JSON `no-store` +
`X-Robots-Tag: noindex`, và bị chặn crawl bằng `Disallow: /internal/`.

| Endpoint | Quyền | Mô tả |
|---|---|---|
| `POST /internal/v1/result-observations/` | ingest | Nhận một observation (`kind: live\|final`), bắt buộc header `Idempotency-Key` (8..128 ký tự) |
| `POST /internal/v1/schedule-sync/` | ingest | Đồng bộ lịch quay theo lô `{rules, exceptions}`, kiểm tra cả lô trước khi ghi |
| `POST /internal/v1/publish-mode/` | operator | `{publish_enabled?: bool, index_enabled?: bool}` — tắt publish thì ingest bị từ chối (423); tắt index có hiệu lực ngay (robots chặn, sitemap rỗng, mọi trang noindex) |
| `GET /internal/v1/health/` | operator | Độ trễ dữ liệu theo đài, số kỳ pending/disputed, trạng thái xuất bản + `index_enabled` (chế độ tối) |

Site đặt `trailingSlash: 'always'` nên các URL trên **phải có `/` cuối** (thiếu slash → `308`).

Mã trả về của `result-observations`: `201` đã ghi · `200` trùng bản đã xác nhận/retry cùng key ·
`400` thiếu `Idempotency-Key` · `401/403` sai token · `409` key dùng với payload khác hoặc ghi đồng thời ·
`422` payload sai · `423` xuất bản đang tắt · `429` vượt 60 request/phút mỗi IP (kèm `Retry-After: 60`).

Payload mẫu:

```json
{
  "station_code": "DONG_NAI",
  "product_code": "xs-mn",
  "draw_date": "2026-11-18",
  "kind": "final",
  "source_id": "src-official",
  "prizes": { "special": ["001234"], "seventh": ["007"] },
  "observed_at": "2026-11-18T09:45:00Z"
}
```

Luật A: nguồn `is_authoritative = 1` → xác nhận ngay; hai nguồn thường trùng `content_hash` →
`auto:dual-source`; một nguồn thường → `pending_confirmation` (hiện số, dò vé từ chối); hai bản final
khác hash → `disputed` (giữ bản cũ); bản final mới khác hash từ nguồn authoritative → revision
`is_correction = 1`; `live` đến sau bản final không hạ trạng thái.

## API đọc công khai

JSON, không cần token, `no-store` cho dữ liệu kết quả và vé; cũng cần `/` cuối.

| Endpoint | Mô tả |
|---|---|
| `GET /api/v1/results/?dai=<slug>&ngay=YYYY-MM-DD&limit=20` | `dai` = slug đài, `ngay` lọc một ngày, `limit` 1..100 (mặc định 20). Không có `dai` thì trả kỳ mới nhất toàn bộ đài; không có `ngay` thì trả các kỳ gần nhất |
| `GET /api/v1/schedule/` | Lịch quay từng đài kèm `next_draw_at_utc`, `window_start_utc`, `expected_final_at_utc`, `window_end_utc` |
| `POST /api/v1/ticket-check/` | `{station, date, ticket}` (nhận cả `dai`/`ngay`/`so`); rate limit theo IP; không log số vé; kỳ chưa xác nhận → `result.kind = not-confirmed` |

Mã lỗi: `404` đài không tồn tại · `422` ngày/vé sai định dạng, thiếu đài · `429` dò vé quá nhanh.

Chuẩn bị secret trên Worker (không đặt trong file):

```bash
npx wrangler secret put INGEST_TOKEN    # token cho n8n
npx wrangler secret put OPERATOR_TOKEN  # token vận hành
```
- ✅ Chặng 3: API `/internal/v1/*` (observations, schedule-sync, publish-mode, health), idempotency,
  luật xác nhận A, 4 workflow n8n (chưa chạy trên n8n thật — xem `n8n/README.md`)
- ⏳ Chặng 4: tạo D1 thật, subdomain, Workers Builds, deploy tối, bật index —
  runbook + checklist sau deploy: [`docs/chang-4-runbook.md`](docs/chang-4-runbook.md)

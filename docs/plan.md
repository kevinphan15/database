# Kế hoạch tổng thể — Website kết quả xổ số

**Phiên bản:** 3.2 · **Ngày:** 12/11/2026 · **Trạng thái:** đã duyệt, xong chặng 1–3, tiếp theo chặng 4

## 1. Quyết định đã chốt

| # | Quyết định |
|---|---|
| 1 | Astro 7, `output: 'server'` + `@astrojs/cloudflare`, TypeScript. SSR on-demand, **không SSG** nên không sinh file HTML cho từng ngày/đài |
| 2 | **Không có admin/CMS** ở giai đoạn này; kỳ quay xác nhận bằng luật tự động |
| 3 | **Luật A**: công bố khi có nguồn authoritative, hoặc 2 nguồn trùng `content_hash` |
| 4 | **Hai môi trường: local + production** (không staging), thay bằng "deploy tối" |
| 5 | Gói Cloudflare **Free**; chỉ nâng $5 nếu CPU > 10 ms/request |
| 6 | Hiển thị bằng **subdomain có sẵn** khi review; trước đó dùng `*.workers.dev` |
| 7 | Cloudflare: **Workers + Static Assets + D1 + Workers Builds** (không Pages/KV/Queues/DO) |
| 8 | Trang ngày **index + self-canonical, kể cả hôm nay** (không dùng noindex cho trang ngày) |
| 9 | Chặn tham số bằng **robots.txt Disallow wildcard**; dò vé bằng **POST**, không sinh URL |
| 10 | Tài nguyên tiền tố `xoso-*`; không chạm project `fieldnotes-*` trong cùng account |

## 2. Kiến trúc

```
n8n (Asia/Ho_Chi_Minh) ──POST /internal/v1/*──► Astro SSR (Worker xoso-web) ──► D1 xoso-db
GitHub main ──► CI (test·build) ──► Workers Builds ──┘
                                        ▼
                          HTML server-rendered + Static Assets
                                        ▼
                            subdomain có sẵn / *.workers.dev
```

| Tài nguyên | Dùng để |
|---|---|
| Worker `xoso-web` | Render HTML, API đọc, API ghi cho n8n, sitemap, robots, dò vé |
| Static Assets | CSS, ảnh, font — miễn phí, không giới hạn request |
| D1 `xoso-db` | Toàn bộ dữ liệu |
| Workers Builds | GitHub → build & deploy khi push `main` |
| Workers Logs | Lỗi, CPU time |
| Rate Limiting (binding) | Chặn spam `/do-ve-so/` |

## 3. Dữ liệu (D1)

Bảng: `regions`, `stations`, `station_aliases`, `products`, `prize_rules` (phiên bản hóa), `sources`
(+ `is_authoritative`), `schedule_rules`, `schedule_exceptions`, `draws` (+ `confirmed_revision_id`,
`rev`), `result_revisions` (append-only, `content_hash`, `is_correction`), `ingest_events`
(idempotency), `index_policy`, `redirects`, `stats_snapshots`, `settings`.

Ràng buộc:

- Số trúng/số vé là **TEXT** (giữ `09`, `001234`). Không bao giờ INTEGER.
- `draw_date` = `YYYY-MM-DD` theo `Asia/Ho_Chi_Minh`; timestamp ISO-8601 UTC.
- Mọi trang đọc **một** bản: `draws.confirmed_revision_id`.
- Ghi nguyên tử bằng `db.batch()` + kiểm `meta.changes` (D1 không có transaction tương tác).
- `UNIQUE(draw_key, kind, content_hash)` chống trùng; `draw_key = station:product:YYYY-MM-DD`.
- Revision lưu `prize_rule_version` để kỳ cũ hiển thị đúng cơ cấu giải lúc quay.

## 4. Trạng thái kỳ và luật xác nhận A

| Trạng thái | Người đọc thấy |
|---|---|
| `scheduled` | "Chờ mở thưởng" |
| `live` | Số đã về + "Đang cập nhật" |
| `pending_confirmation` | Có số + nhãn "Chưa đối soát"; dò vé từ chối |
| `confirmed` | "Đã xác nhận · cập nhật lúc …" |
| `disputed` | Bản cũ + nhãn "Đang đối soát"; dò vé từ chối |

Luật A: nguồn authoritative → công bố (`auto:authoritative`); 2 nguồn trùng hash → công bố
(`auto:dual-source`); 1 nguồn thường → hiện số nhưng "Chưa đối soát"; hai bản final khác hash →
`disputed`, giữ bản cũ, cảnh báo; `live` đến sau `confirmed` không hạ trạng thái; bản final mới khác
hash từ authoritative tạo revision `is_correction=1`.

Công tắc sự cố: `settings.publish_enabled = 0` → ingest bị từ chối (423), trang đọc bản cuối.

## 5. API

| Endpoint | Vai trò |
|---|---|
| `GET /api/v1/results` · `GET /api/v1/schedule` | công khai; schedule trả thêm `window_start_utc`, `window_end_utc`, `expected_final_at_utc` |
| `POST /api/v1/ticket-check` | công khai; POST, không log số vé, rate limit |
| `POST /internal/v1/result-observations` | n8n; Bearer + `Idempotency-Key`; 201/200/401/403/409/422/429 |
| `POST /internal/v1/schedule-sync` | n8n; kiểm tra cả lô trước khi kích hoạt |
| `POST /internal/v1/publish-mode` | vận hành; bật/tắt xuất bản |
| `GET /internal/v1/health` | độ trễ dữ liệu theo đài |

## 6. URL và SEO

| URL | Index | Canonical | Sitemap |
|---|---|---|---|
| `/`, `/xo-so-mien-*/`, `/xo-so-mien-*/<dai>/` | ✅ | self | ✅ |
| `/xo-so-mien-*/YYYY-MM-DD/`, `…/<dai>/YYYY-MM-DD/` (kể cả hôm nay) | ✅ | **self** | ✅ khi có dữ liệu (cửa sổ 90 ngày/đài) |
| Ngày không có lịch quay | — | — | **404** |
| `/lich-mo-thuong/`, `/so-ket-qua/`, `/do-ve-so/`, `/huong-dan/*` | ✅ | self | ✅ |
| `/thong-ke/giai-dac-biet/` (chưa đủ dữ liệu để duyệt) | ❌ | self | ❌ |
| Tham số lọc (`?tu-ngay=`, `?page=`, …) | ❌ | — | `robots.txt Disallow` wildcard |
| Kết quả dò vé | ❌ | — | POST, không có URL |

Không dùng `noindex` cho trang ngày (Google: noindex chặn hoàn toàn; canonical là cách đúng để xử lý
trùng lặp trong cùng site).

## 7. Cache

| Loại | Header |
|---|---|
| Asset có hash | `max-age=31536000, immutable` |
| Trang kỳ đã confirmed | `s-maxage=30..60, stale-while-revalidate=120` |
| Trang hôm nay / live / API kết quả | `no-store` |
| `/internal/*`, ticket-check | `no-store, private` |
| `robots.txt`, `sitemap.xml` | `no-store` — công tắc index phải có hiệu lực ngay, không phục vụ bản cache cũ |

Chọn TTL thay vì purge: đính chính lan trong ≤ TTL.

## 8. Vận hành và bảo mật

- **Deploy tối:** production lần đầu chạy `publish_enabled = 0` + robots chặn + `X-Robots-Tag: noindex`;
  kiểm tra trên domain thật rồi mới bật index.
- **Rollback:** chuyển về Worker version trước; dữ liệu sai → `publish_enabled = 0`.
- **Backup:** `wrangler d1 export` trước mỗi migration remote + định kỳ. Time Travel: 7 ngày (Free),
  restore ghi đè in-place.
- **Bảo mật:** bật 2FA cho account Cloudflare; token CI scoped `Workers Scripts:Edit` + `D1:Edit`
  trong GitHub Secrets; token n8n riêng chỉ ghi `/internal/v1/*`; không log số vé.

## 9. Lộ trình

| Chặng | Nội dung | Xong khi |
|---|---|---|
| 1 | Khung Astro + schema D1 + fixture Đồng Nai + 4 trang SSR + test + CI | HTML thô có lịch/bảng/trạng thái khi tắt JS; test & build xanh |
| 2 | Trang ngày, sổ kết quả, thống kê, dò vé, content collections, sitemap/robots, redirects, 404 | Đủ 8 nhóm URL; checklist SEO pass |
| 3 | Ingest + idempotency + luật A + publish-mode + health + 4 workflow n8n | Ca trùng/đồng thời/thiếu/lệch pass, không cần thao tác tay |
| 4 | Subdomain, D1 thật, Workers Builds, deploy tối, load test, diễn tập khôi phục, bật index | 5 URL đúng, CPU trong ngưỡng, đã thử rollback — runbook: [`chang-4-runbook.md`](chang-4-runbook.md) |

## 10. Còn treo

1. Tên subdomain cụ thể (chặng 4).
2. Danh sách nguồn cào + nguồn nào là authoritative: chặng 3 đã dựng luật và nguồn MẪU
   (`src-official` authoritative, `src-backup` thường) để kiểm thử; nguồn thật đầu tiên đã có ở
   `migrations/0004_sources.sql` (`src-official` authoritative, `src-live` không), chờ xác nhận quyền
   sử dụng lại trước khi bật index.
3. Bật 2FA Cloudflare (trước chặng 4).

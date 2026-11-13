# Runbook chặng 4 — D1 thật, Workers Builds, subdomain, deploy tối, bật index

Mỗi bước ghi rõ **làm gì**, **lệnh**, và **dấu hiệu đúng**. Các mục đánh dấu 🔧 là việc **phải sửa
code trước** khi deploy; phần còn lại là thao tác tài khoản Cloudflare/GitHub.

## 0. Chuẩn bị (làm trước, không đụng production)

| # | Việc | Cách kiểm |
|---|---|---|
| 0.1 | Bật **2FA** cho tài khoản Cloudflare | Dashboard → My Profile → Authentication |
| 0.2 | Tạo API token **scoped** cho CI: `Workers Scripts:Edit` + `D1:Edit`, giới hạn account | `npx wrangler whoami` từ CI |
| 0.3 | Chốt lựa chọn domain: **custom domain** (cần zone trong account) hay `xoso-web.<account>.workers.dev` | Xem mục 4 |
| 0.4 | ✅ `wrangler.jsonc` đã dọn: chỉ còn top-level, `database_id` chỉ có **một** chỗ | `grep -c "database_id" wrangler.jsonc` → `1` |
| 0.5 | ✅ Seed ở `seed/fixture.sql`; `migrations/` chỉ còn schema + tham chiếu thật (`0004_sources.sql`, `0005_reference.sql`) | `grep -l "INSERT" migrations/*.sql` → chỉ 0004, 0005 |
| 0.6 | ✅ Công tắc index đã đấu vào code và endpoint publish-mode (xem mục 7.0) | `grep -rn "indexEnabled" src` → có ở mọi trang |

## 1. Tạo D1 thật và nạp schema

```bash
npx wrangler d1 create xoso-db
# ghi lại database_id, điền vào wrangler.jsonc (chỉ một chỗ duy nhất, binding DB)
npx wrangler d1 list                      # thấy xoso-db + id khớp file config
npx wrangler d1 export xoso-db --remote --output backup-$(date +%Y%m%d).sql   # lần đầu sẽ rỗng
npx wrangler d1 execute xoso-db --remote --file=./migrations/0001_init.sql
npx wrangler d1 execute xoso-db --remote --file=./migrations/0004_sources.sql
npx wrangler d1 execute xoso-db --remote --file=./migrations/0005_reference.sql
```

**Không chạy `seed/fixture.sql` ở remote** — đó là dữ liệu GIẢ (`data_mode = fixture`), sẽ hiện
banner "DỮ LIỆU MẪU" và số sai trên domain thật. `migrations/` chỉ còn schema nên chạy remote là an
toàn; mọi file seed phải nằm ngoài thư mục đó.

**Đã kiểm chứng trên D1 local sạch (2026-11-13)** bằng đúng chuỗi production, không seed:

```bash
npx wrangler d1 execute xoso-db --local --persist-to /tmp/xoso-prodcheck --file=./migrations/0001_init.sql
npx wrangler d1 execute xoso-db --local --persist-to /tmp/xoso-prodcheck --file=./migrations/0004_sources.sql
npx wrangler d1 execute xoso-db --local --persist-to /tmp/xoso-prodcheck --file=./migrations/0005_reference.sql
```

Kết quả: **15 bảng + 4 chỉ mục**, **đúng 2 nguồn** (`src-official` = `official`/authoritative 1,
`src-live` = `scrape`/authoritative 0), và **dữ liệu tham chiếu**: `regions 1`, `stations 1`,
`products 1`, `prize_rules 9`, `schedule_rules 1`. Mọi bảng kết quả đều rỗng: `draws`,
`result_revisions`, `ingest_events`, `settings`, `index_policy`, `redirects`, `stats_snapshots`,
`schedule_exceptions` = 0. Chạy lại `0004`/`0005` vẫn đúng số đó (idempotent). Đối chiếu D1 local có
seed: `sources 3`, `settings 4`, `draws 6` — không có kỳ quay hay số trúng nào lọt vào từ migration.

**Đo end-to-end trên D1 sạch (0001 + 0004 + 0005):** `POST /internal/v1/result-observations/` với
nguồn `src-official` → **201 `confirm`** (`confirmed`, lý do “nguồn authoritative”); trang đài
`/xo-so-mien-nam/dong-nai/` và trang ngày `/xo-so-mien-nam/dong-nai/2026-11-11/` trả **200** và
render đủ **9 nhãn giải** (`Giải Đặc Biệt` … `Giải Tám`) với số giữ nguyên số 0 đầu; sitemap có 11
URL (8 trang tĩnh + miền + đài + ngày). Nếu chỉ chạy `0001 + 0004` thì ingest trả **422
`unknown_station`** vì thiếu `stations`/`products`/`prize_rules` — đó là lý do `0005` tồn tại.

> `migrations/0003_chang3.sql` đã bị xoá: nó chỉ chứa 3 index trùng tên với `0001` (nên chưa bao giờ
> được áp) và 1 index không truy vấn nào dùng, cộng 2 nguồn mẫu. Chuỗi production hiện tại là
> `0001_init.sql` + `0004_sources.sql` + `0005_reference.sql`.
>
> Vì `settings` rỗng nghĩa là **mọi công tắc đang bật**, phải chạy mục 5 (deploy tối) trước khi trỏ
> domain vào, nếu không site sẽ index ngay từ request đầu tiên.

Kiểm:

```bash
npx wrangler d1 execute xoso-db --remote --command "select name from sqlite_master where type='table' order by name"
npx wrangler d1 execute xoso-db --remote --command "select key, value from settings"
npx wrangler d1 execute xoso-db --remote --command "select source_id, kind, is_authoritative from sources order by source_id"
npx wrangler d1 execute xoso-db --remote --command "select (select count(*) from regions) regions, (select count(*) from stations) stations, (select count(*) from products) products, (select count(*) from prize_rules) prize_rules, (select count(*) from schedule_rules) schedule_rules, (select count(*) from draws) draws"
```

Kỳ vọng: đủ 15 bảng; **đúng 2 nguồn** (`src-official` authoritative 1, `src-live` authoritative 0) và
**dữ liệu tham chiếu** `regions 1 / stations 1 / products 1 / prize_rules 9 / schedule_rules 1`
(`draws 0` trước khi n8n chạy) — lệch số này thì dừng, đừng chạy n8n; `settings` **không** có
`data_mode = fixture`; sau mục 5 thì có
`publish_enabled = 0` và `index_enabled = 0` (trước đó bảng `settings` rỗng).

### 1b. Hành vi khi D1 đã migrate nhưng chưa có kỳ quay nào

Đây là trạng thái đúng sau mục 1 và trước lần chạy n8n đầu tiên: D1 có `0001 + 0004 + 0005`, bảng
`draws` rỗng. Đo trên Worker build: **không có 5xx, không có dòng dữ liệu mẫu nào**.

| URL | Kết quả mong đợi |
|---|---|
| `/` | 200 — “Kết quả xổ số hôm nay”, có đài nhưng chưa có kỳ, không banner dữ liệu mẫu |
| `/xo-so-mien-nam/`, `/xo-so-mien-nam/dong-nai/` | 200 — trang miền/đài rỗng (đã có tham chiếu, chưa có kết quả) |
| `/xo-so-mien-nam/dong-nai/<ngày có quay>/` | 200, rỗng (thứ Tư nhưng chưa có kỳ) |
| `/xo-so-mien-nam/dong-nai/<ngày không quay>/` | **404** |
| `/so-ket-qua/`, `/lich-mo-thuong/`, `/do-ve-so/`, `/huong-dan/`, `/thong-ke/giai-dac-biet/` | 200, nội dung rỗng, không banner |
| `/sitemap.xml` | 200, urlset hợp lệ, **10 URL**: 8 trang tĩnh + miền + đài; **không** có URL trang ngày nào |
| `/api/v1/results/`, `/api/v1/schedule/` | 200, `count: 0`, `source: "d1"` |
| `/robots.txt` | 200, luật bình thường — hoặc `Disallow: /` nếu index đang tắt |

Nếu chỉ chạy `0001` (chưa có `0004/0005`): mọi trang vẫn 200 nhưng chưa có đài, `/xo-so-mien-nam/`
404 và sitemap chỉ có 8 trang tĩnh.

**Khi D1 lỗi truy vấn** (khác với rỗng — ví dụ thiếu bảng, D1 hỏng): mọi trang có banner
“Tạm thời chưa tải được dữ liệu kết quả…”; trang miền/đài/ngày trả **503** kèm câu “đây không phải
lỗi đường dẫn”, không trả 404 (404 cho URL đúng sẽ khiến công cụ tìm kiếm và uptime check hiểu sai);
các trang nội dung 200 với câu giải thích riêng thay vì “hôm nay không có đài nào quay”; API trả
`"degraded": true` + `notice`; `robots.txt` là `Disallow: /` và sitemap rỗng vì không đọc được công
tắc thì index coi như tắt (fail-closed). Đo bằng Worker trỏ vào D1 chưa có bảng nào.

Quy tắc đằng sau: **có binding D1 thì không bao giờ rơi về fixture**, kể cả khi D1 rỗng hoặc lỗi truy
vấn — thà trang trống còn hơn hiện số giả trên domain thật. Fixture chỉ xuất hiện khi chạy
`astro dev`/`wrangler dev` **không có** binding `DB`. Sitemap vì thế cũng không bao giờ chứa URL
đài/ngày giả; khi index tắt thì urlset rỗng hoàn toàn.

## 2. Secrets

```bash
npx wrangler secret put INGEST_TOKEN      # token cho n8n
npx wrangler secret put OPERATOR_TOKEN    # token vận hành
npx wrangler secret list                  # thấy 2 tên, không thấy giá trị
```

Token phải khác nhau, ≥ 32 ký tự ngẫu nhiên, lưu trong trình quản lý mật khẩu. n8n dùng
`XOSO_INGEST_TOKEN`, vận hành dùng `XOSO_OPERATOR_TOKEN` (xem `n8n/README.md`).

## 3. Workers Builds (CI/CD)

Dashboard → Workers & Pages → `xoso-web` → Settings → Builds:

| Trường | Giá trị |
|---|---|
| Repository | `kevinphan15/database` |
| Branch | `main` (chỉ nhánh này deploy) |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |
| Env | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (token ở 0.2) |

GitHub Actions hiện chạy test/build, `npm run check:n8n` (4 workflow phải là JSON hợp lệ) và thử
migration + seed trên SQLite local — giữ nguyên làm hàng rào trước khi Workers Builds deploy. Sau khi
nối, mỗi push `main` phải xanh cả hai nơi.

> `wrangler deploy` đọc config **đã sinh** ở `dist/server/wrangler.json` (Wrangler báo "Using
> redirected Wrangler configuration"), nên phải `npm run build` trước khi deploy — đừng deploy bằng
> bản `dist/` cũ sau khi sửa `wrangler.jsonc`.

## 4. Subdomain

Hai đường, chọn một:

**A. workers.dev (nhanh, để review):** Dashboard → Worker → Settings → Domains & Routes → bật
`xoso-web.<account>.workers.dev`. Không cần zone, không cần DNS.

**B. Subdomain trên domain có sẵn (dùng lâu dài):** domain phải là **zone trong cùng account**
(Namecheap/GoDaddy… chỉ trỏ NS về Cloudflare trước). Sau đó Worker → Settings → Domains & Routes →
Add → Custom domain → `xoso.ten-mien.com`. Cloudflare tự tạo DNS record + TLS.

Kiểm:

```bash
dig +short xoso.ten-mien.com
curl -sI https://xoso.ten-mien.com/ | head -5
```

Kỳ vọng: có A/AAAA record; HTTPS 200; không lỗi 522/526. Nếu account **chưa có zone** thì phải
thêm domain vào Cloudflare trước — bước này chặn toàn bộ mục 4B.

## 5. Deploy tối (lần đầu)

```bash
npx wrangler d1 execute xoso-db --remote --command "update settings set value='0' where key='publish_enabled'"
npx wrangler d1 execute xoso-db --remote --command "insert or replace into settings (key, value) values ('index_enabled', '0')"
npx wrangler deploy
```

> Hàng `index_enabled` chưa có trong D1 mới nên phải `insert or replace` — `update` sẽ khớp 0 dòng.
> Code coi **thiếu hàng = bật** (để không tự khoá index của site đang chạy), còn **D1 lỗi khi đọc
> settings = tắt**, nên bỏ qua bước này là deploy sáng đèn ngay.
>
> Sau khi Worker đã chạy, đổi công tắc bằng endpoint thay cho SQL (có hiệu lực ngay, không cần
deploy lại):
>
> ```bash
> curl -s -X POST $BASE/internal/v1/publish-mode/ -H "Authorization: Bearer $OP" \
>   -H 'content-type: application/json' -d '{"publish_enabled": true, "index_enabled": false}'
> ```

Trong chế độ tối: `robots.txt` là `Disallow: /`, HTML có `X-Robots-Tag: noindex`, sitemap rỗng,
ingest trả 423. Cả `robots.txt` và `sitemap.xml` trả `cache-control: no-store` — kiểm bằng
`curl -sI $BASE/robots.txt | grep -i cache-control` phải ra `no-store`, vì `public, max-age=3600` sẽ
khiến trình duyệt/crawler giữ `Allow: /` và danh sách URL cũ tới một giờ sau khi tắt index. Đây là
trạng thái **bắt buộc** cho tới khi xong checklist mục 6 (mục 25–30 kiểm đúng các header này).

Khi **D1 lỗi truy vấn** (bảng chưa tồn tại, D1 không đọc được), mọi trang HTML nội dung trả **503**
chứ không phải 200 rỗng: `/`, trang miền/đài/ngày, `/lich-mo-thuong/`, `/so-ket-qua/`,
`/thong-ke/giai-dac-biet/`, `/do-ve-so/` — kèm banner giải thích, `X-Robots-Tag: noindex` và
`Cache-Control: no-store`. Trang **404** (đường dẫn sai) cũng `no-store`, vì 404 nằm trong nhóm được
phép cache theo heuristic (RFC 9111 §4.2.2) và sẽ dính lại trong cache trình duyệt sau khi URL có
nội dung. Quy tắc chung: **không response lỗi nào được cache** — 503 báo sự cố, 404 báo đường dẫn
sai, cả hai đều không có nội dung ổn định để tái dùng. Riêng `/do-ve-so/`, POST body không phải form
(JSON, rỗng) không thành 500: **503 + `no-store`** khi D1 lỗi, **200 + `no-store`** khi D1 khoẻ; body
hỏng thì bỏ qua cả rate limit (không truy vấn gì) — đây không phải sự cố, đừng coi là crash.

## 6. Checklist sau deploy (chạy trên domain thật)

Đặt `BASE=https://xoso.ten-mien.com` (hoặc host workers.dev).

**Đã chạy phần chạy được trên local (2026-11-13):** Worker build + D1 sạch `0001+0004+0005` +
`settings(index_enabled=0, publish_enabled=0)` ⇒ mục 1 `200 text/html`; 2 `301`; 4 `401` + `noindex` +
`no-store, private`; 5 `200` + `no-store`; 6–11 mọi trang `200` (riêng ngày không quay `404`, không
canonical) với `robots=noindex, nofollow` + `X-Robots-Tag: noindex`; `robots.txt` = `Disallow: /`
(không `Sitemap:`); `sitemap.xml` 0 URL; 12 `ok:true, count:0`; 13 có `next_draw_at_utc`; 14
`not-confirmed`; 15 `publish=false, index=false`; 16 `401`/`422`; 17 `429` + `Retry-After: 60`; 18
`draws=0`; 21 `423` và **không ghi gì** (`draws=0`, `ingest_events=0`); 24 bật `index_enabled` →
robots `Allow`, sitemap 10 URL, không còn `X-Robots-Tag`, `meta robots` = `index, follow`; tắt lại →
chặn ngay; 25–26 `no-store` trên cả `robots.txt` và `sitemap.xml`; 27–29 (`no-store` của 404/503 và
trang chủ 503 khi D1 lỗi) đã kiểm trên local — 27–28 cần chạy lại trên domain thật. Chưa chạy được ở local: 3 (asset),
8 (cần kỳ thật có 9 giải), 19 (`wrangler tail`, CPU gói Free), 20 (n8n chạy kỳ thật), 22–23
(`deployments`/rollback) — phải làm trên domain thật.

### 6.1 Hạ tầng và header

| # | Lệnh | Kỳ vọng |
|---|---|---|
| 1 | `curl -sI $BASE/` | `200`, `content-type: text/html` |
| 2 | `curl -sI $BASE/xo-so-mien-nam` | `301` → `/xo-so-mien-nam/` (một bước, đúng đích; `308` cũng đạt) |
| 3 | `curl -s $BASE/ \| grep -c '<style'` | `1` — CSS được inline vào HTML (`global.css` ~3 KB), build **không** sinh `_astro/*.css`; luật `_headers` chỉ có tác dụng khi có asset thật |
| 4 | `curl -sI $BASE/internal/v1/health/` | `401` (thiếu token) + `x-robots-tag: noindex` + `cache-control: no-store, private` |
| 5 | `curl -sI $BASE/api/v1/results/` và `curl -sI $BASE/api/v1/schedule/` | `200`, `cache-control: no-store` ở **cả hai** |

### 6.2 Nội dung (5 nhóm URL)

| # | URL | Kỳ vọng |
|---|---|---|
| 6 | `/` | 200, có bảng/lịch; **không** có chữ "DỮ LIỆU MẪU" |
| 7 | `/xo-so-mien-nam/` và `/xo-so-mien-nam/dong-nai/` | 200, tên đài + kỳ gần nhất |
| 8 | `/xo-so-mien-nam/dong-nai/<ngày có quay>/` | 200, đủ 9 giải, số giữ `0` đầu (`09`, `001234`) |
| 9 | `/xo-so-mien-nam/<ngày không quay>/` | **404**, không có canonical |
| 10 | `/so-ket-qua/`, `/lich-mo-thuong/`, `/do-ve-so/`, `/huong-dan/<bài>/` | 200 |
| 11 | `curl -s $BASE/xo-so-mien-nam/dong-nai/<ngày>/ \| grep canonical` | canonical = **chính URL đó**, đúng host https |

### 6.3 Dữ liệu và API

| # | Lệnh | Kỳ vọng |
|---|---|---|
| 12 | `curl -s $BASE/api/v1/results/?dai=dong-nai&limit=2` | `ok:true`, `prizes` là chuỗi |
| 13 | `curl -s $BASE/api/v1/schedule/` | có `next_draw_at_utc` |
| 14 | `curl -s -X POST $BASE/api/v1/ticket-check/ -H 'content-type: application/json' -d '{"station":"dong-nai","date":"<ngày>","ticket":"000000"}'` | `result.kind` ∈ `prize\|no-prize\|not-confirmed` |
| 15 | `curl -s $BASE/internal/v1/health/ -H "Authorization: Bearer $OP"` | `ok:true`, `lag_days >= 0`; token sai → `401`, dùng `INGEST_TOKEN` (sai vai trò) → `403` |
| 16 | POST `result-observations` sai token | `401`; đúng token + payload sai | `422` |
| 17 | 61 request liên tiếp | request cuối `429` + `Retry-After` |
| 18 | `npx wrangler d1 execute xoso-db --remote --command "select count(*) from draws"` | khớp số kỳ đã nhận |

### 6.4 Vận hành

| # | Việc | Kỳ vọng |
|---|---|---|
| 19 | `npx wrangler tail` khi gọi 10 URL | không exception, CPU mỗi request < 10 ms (gói Free) |
| 20 | Bật `publish_enabled=1`, để n8n chạy 1 kỳ | kỳ mới xuất hiện đúng trạng thái (`pending_confirmation`/`confirmed`) |
| 21 | Tắt `publish_enabled=0` rồi POST observation | `423`, dữ liệu cũ vẫn hiển thị |
| 22 | `npx wrangler deployments list` | có version hiện tại để rollback |
| 23 | Diễn tập rollback: `npx wrangler rollback` rồi deploy lại | site trở lại bản trước, không mất dữ liệu D1 |
| 24 | `POST /internal/v1/publish-mode/` với `{"index_enabled": false}` rồi `true` | 200, đổi ngay: robots chặn/bỏ chặn, sitemap rỗng/có URL, không cần deploy lại |

### 6.5 Cache của robots/sitemap, trang lỗi và API công khai

Response mang tín hiệu index hoặc báo lỗi mà bị cache có TTL thì sau khi tắt index/sửa lỗi vẫn bị
phục vụ bản cũ cho tới hết TTL.

| # | Lệnh | Kỳ vọng |
|---|---|---|
| 25 | `curl -sI $BASE/robots.txt \| grep -i cache-control` | `no-store`, **không** có `max-age` |
| 26 | `curl -sI $BASE/sitemap.xml \| grep -i cache-control` | `no-store`, **không** có `max-age` |
| 27 | `curl -sI $BASE/khong-ton-tai/` | `404` + `cache-control: no-store` (trang 404 chung) |
| 28 | `curl -sI $BASE/xo-so-mien-nam/khong-co/` | `404` + `no-store` — 404 của trang miền/đài/ngày cũng vậy |
| 29 | local, D1 lỗi (persist rỗng): `curl -sI http://127.0.0.1:<port>/`, `/xo-so-mien-nam/`, `/lich-mo-thuong/`, `/so-ket-qua/`, `/thong-ke/giai-dac-biet/`, `/do-ve-so/` | `503` + `no-store`, body có banner "Tạm thời chưa tải được dữ liệu…" |
| 30 | local: `curl -s -o /dev/null -D - -X POST -H 'content-type: application/json' -d '{"ticket":"001234"}' http://127.0.0.1:<port>/do-ve-so/` | D1 lỗi (persist rỗng): `503` + `no-store`; D1 khoẻ (seed `0001+0004+0005`): `200` + `no-store`, **không** `500` |

Mục 29–30 chỉ kiểm được ở local: không mô phỏng D1 lỗi trên production mà không phá dữ liệu thật.

API công khai (`/api/v1/results/`, `/api/v1/schedule/`, `/api/v1/ticket-check/`) cũng `no-store`
(mục 5) ở cả response thành công lẫn lỗi (400 JSON hỏng, 422, 429 → `no-store, private`): payload có
`generated_at`/`next_draw_at_utc`/`degraded` tính theo lúc gọi nên không giữ TTL — đừng nhầm với hai
file trên khi kiểm.

## 7. Bật index

### 7.0 Công tắc index — ✅ đã đấu xong

- `settings.index_enabled`: `loadDataset()` đọc **lại mỗi request** thành `Dataset.index_enabled`
  (**thiếu hàng = bật**, `'0'` = tắt; **không đọc được settings/D1 lỗi = tắt** — fail-closed, để
deploy tối không tự mở index vì sự cố D1); fixture mặc định bật.
- `decideIndex({ …, indexEnabled: dataset.index_enabled })` ở **mọi** trang (home, miền, đài, ngày,
  sổ kết quả, dò vé, hướng dẫn, thống kê). Trang 404 vốn đã `noindex` cố định.
- `robots.txt`: tắt → `Disallow: /`, không khai sitemap; bật → luật cũ + `Sitemap:`.
- `sitemap.xml`: tắt → urlset rỗng (vẫn 200); bật → danh sách URL như cũ.
- Middleware: tắt → gắn `X-Robots-Tag: noindex` cho mọi response, **không ghi đè** header trang đã
  tự đặt (ví dụ kết quả dò vé `noindex, follow`).
- Test: `tests/index-switch.test.ts` (policy, robots, sitemap, middleware),
  `tests/index-fail-closed.test.ts` (D1 lỗi đọc settings → robots chặn + sitemap rỗng, còn thiếu hàng
  thì vẫn bật) và `tests/degraded-pages.test.ts` (banner + 503 + `degraded` trong API).

Còn lại (không chặn deploy): bảng `index_policy` trong D1 vẫn chưa được đọc — hiện là dự phòng cho
luật index theo mẫu URL.

> **Đổi công tắc:** `/internal/v1/publish-mode/` nhận `{"publish_enabled"?: bool, "index_enabled"?: bool}`
> (một hoặc cả hai), ghi cả hai trong một batch và trả giá trị hiệu lực. Công tắc index được **đọc
> lại ở mỗi request** (một truy vấn khoá chính trong `settings`) nên tắt/bật có hiệu lực ngay trên
> mọi isolate, không phải chờ isolate mới hay deploy lại. Sửa bằng `wrangler d1 execute` vẫn dùng
> được nhưng chỉ ăn ở isolate mới — dùng endpoint khi cần tức thì.

### 7.1 Trình tự bật

1. Xác nhận checklist mục 6 xanh 100% (trừ các mục cố ý ở chế độ tối).
2. Bật index: `curl -s -X POST $BASE/internal/v1/publish-mode/ -H "Authorization: Bearer $OP" -H 'content-type: application/json' -d '{"index_enabled": true}'` — phản hồi phải là `index_enabled: true`; nếu vẫn `false` thì lệnh không tới đúng Worker/D1.
3. Kiểm ngay (chưa cần chờ bot):
   - `curl -s $BASE/robots.txt` → `Allow: /`, có `Sitemap: https://…/sitemap.xml`;
   - `curl -s $BASE/ <\!-- --> | grep robots` → `index, follow`;
   - `curl -sI $BASE/` → **không** còn `X-Robots-Tag: noindex`;
   - `curl -s $BASE/sitemap.xml | head` → URL đúng host, không có `?dai=`.
4. Search Console: thêm property (domain hoặc URL prefix), xác minh, **Submit sitemap**.
5. Request indexing thủ công cho 3 URL: chủ, trang miền, trang ngày mới nhất.
6. Theo dõi 48h: Coverage (loại trừ `?dai=`/`?page=` là đúng), lỗi 5xx, Core Web Vitals.

### 7.2 Sau khi bật

- Không bao giờ để `robots.txt` chặn rồi lại bật index mà quên sitemap (Google sẽ bỏ qua sitemap).
- Trang ngày **giữ index + self-canonical**, kể cả hôm nay; không thêm `noindex`.
- Thống kê vẫn `noindex` cho tới khi có dữ liệu đủ và được duyệt.

## 8. Rollback và sao lưu

| Tình huống | Hành động |
|---|---|
| Deploy lỗi code | `npx wrangler deployments list` → `npx wrangler rollback [version]` |
| Dữ liệu sai / nguồn hỏng | `update settings set value='0' where key='publish_enabled'` (ingest 423, trang đọc bản cuối) |
| Cần quay lui dữ liệu | D1 Time Travel 7 ngày (Free): `npx wrangler d1 time-travel restore xoso-db --timestamp=<unix>` |
| Trước mỗi migration remote | `npx wrangler d1 export xoso-db --remote --output backup-<ngày>.sql` |

## 9. Định nghĩa "chặng 4 xong"

- [ ] `wrangler.jsonc` có `database_id` thật, không còn `00000000-…`, không trùng khai báo env
- [ ] `data_mode` không phải `fixture`; trang production không hiện banner dữ liệu mẫu
- [ ] 2 secret đã đặt, token CI scoped, 2FA bật
- [ ] Workers Builds deploy xanh từ `main`; CI xanh
- [ ] Subdomain/workers.dev trả 200 qua HTTPS
- [ ] Checklist mục 6 (30 mục) xanh
- [ ] Đã diễn tập rollback Worker + tắt `publish_enabled`
- [ ] Index đã bật, robots/sitemap/meta đúng, sitemap đã submit
- [ ] n8n chạy ít nhất 1 kỳ thật end-to-end (live → final → confirmed/disputed)

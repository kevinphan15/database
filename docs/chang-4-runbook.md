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
| 0.5 | 🔧 Seed đã tách sang `seed/fixture.sql`, `migrations/` sạch dữ liệu mẫu; còn phải thêm `migrations/0004_sources.sql` chứa nguồn thật | `grep -l "INSERT" migrations/*.sql` → không có |
| 0.6 | 🔧 Đấu **công tắc index** vào code (xem mục 7.0) — hiện `indexEnabled` có trong `policy.ts` nhưng chưa nơi nào truyền | `grep -rn "indexEnabled" src` |

## 1. Tạo D1 thật và nạp schema

```bash
npx wrangler d1 create xoso-db
# ghi lại database_id, điền vào wrangler.jsonc (chỉ một chỗ duy nhất, binding DB)
npx wrangler d1 list                      # thấy xoso-db + id khớp file config
npx wrangler d1 export xoso-db --remote --output backup-$(date +%Y%m%d).sql   # lần đầu sẽ rỗng
npx wrangler d1 execute xoso-db --remote --file=./migrations/0001_init.sql
npx wrangler d1 execute xoso-db --remote --file=./migrations/0003_chang3.sql
npx wrangler d1 execute xoso-db --remote --file=./migrations/0004_sources.sql
```

**Không chạy `seed/fixture.sql` ở remote** — đó là dữ liệu GIẢ (`data_mode = fixture`), sẽ hiện
banner "DỮ LIỆU MẪU" và số sai trên domain thật. `migrations/` chỉ còn schema nên chạy remote là an
toàn; mọi file seed phải nằm ngoài thư mục đó.

Kiểm:

```bash
npx wrangler d1 execute xoso-db --remote --command "select name from sqlite_master where type='table' order by name"
npx wrangler d1 execute xoso-db --remote --command "select key, value from settings"
```

Kỳ vọng: đủ 15 bảng; `settings` **không** có `data_mode = fixture`; có `publish_enabled = 0`.

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

GitHub Actions hiện chỉ test/build + chạy migration trên SQLite local — giữ nguyên làm hàng rào
trước khi Workers Builds deploy. Sau khi nối, mỗi push `main` phải xanh cả hai nơi.

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
> Code coi **thiếu hàng = bật** (để không tự khoá index của site đang chạy), nên bỏ qua bước này là
> deploy sáng đèn ngay.
>
> Sau khi Worker đã chạy, đổi công tắc bằng endpoint thay cho SQL (có hiệu lực ngay, không cần
deploy lại):
>
> ```bash
> curl -s -X POST $BASE/internal/v1/publish-mode/ -H "Authorization: Bearer $OP" \
>   -H 'content-type: application/json' -d '{"publish_enabled": true, "index_enabled": false}'
> ```

Trong chế độ tối: `robots.txt` là `Disallow: /`, HTML có `X-Robots-Tag: noindex`, sitemap rỗng,
ingest trả 423. Đây là trạng thái **bắt buộc** cho tới khi xong checklist mục 6.

## 6. Checklist sau deploy (chạy trên domain thật)

Đặt `BASE=https://xoso.ten-mien.com` (hoặc host workers.dev).

### 6.1 Hạ tầng và header

| # | Lệnh | Kỳ vọng |
|---|---|---|
| 1 | `curl -sI $BASE/` | `200`, `content-type: text/html` |
| 2 | `curl -sI $BASE/xo-so-mien-nam` | `308` → `/xo-so-mien-nam/` (trailing slash) |
| 3 | `curl -sI $BASE/_astro/<file>.css` | `200` + `cache-control: public, max-age=31536000, immutable` (adapter chèn qua `_headers`) |
| 4 | `curl -sI $BASE/internal/v1/health/` | `403` (thiếu token) + `x-robots-tag: noindex` + `cache-control: no-store, private` |
| 5 | `curl -sI $BASE/api/v1/results/` | `200`, `cache-control: no-store` |

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
| 15 | `curl -s $BASE/internal/v1/health/ -H "Authorization: Bearer $OP"` | `ok:true`, `lag_days >= 0`; token sai → `403` |
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

## 7. Bật index

### 7.0 Công tắc index — ✅ đã đấu xong

- `settings.index_enabled`: `loadDataset()` đọc **lại mỗi request** thành `Dataset.index_enabled`
  (**thiếu hàng = bật**, `'0'` = tắt); fixture mặc định bật.
- `decideIndex({ …, indexEnabled: dataset.index_enabled })` ở **mọi** trang (home, miền, đài, ngày,
  sổ kết quả, dò vé, hướng dẫn, thống kê). Trang 404 vốn đã `noindex` cố định.
- `robots.txt`: tắt → `Disallow: /`, không khai sitemap; bật → luật cũ + `Sitemap:`.
- `sitemap.xml`: tắt → urlset rỗng (vẫn 200); bật → danh sách URL như cũ.
- Middleware: tắt → gắn `X-Robots-Tag: noindex` cho mọi response, **không ghi đè** header trang đã
  tự đặt (ví dụ kết quả dò vé `noindex, follow`).
- Test: `tests/index-switch.test.ts` (policy, robots, sitemap, middleware).

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
- [ ] Checklist mục 6 (23 mục) xanh
- [ ] Đã diễn tập rollback Worker + tắt `publish_enabled`
- [ ] Index đã bật, robots/sitemap/meta đúng, sitemap đã submit
- [ ] n8n chạy ít nhất 1 kỳ thật end-to-end (live → final → confirmed/disputed)

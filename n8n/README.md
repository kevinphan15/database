# Workflow n8n (chặng 3)

Bốn workflow, import bằng **n8n → Workflows → Import from File**. Múi giờ: `Asia/Ho_Chi_Minh`
(mọi workflow đều tính giờ VN trong Code node).

| File | Chạy | Làm gì |
|---|---|---|
| `01-schedule-sync.json` | 06:00 hằng ngày | Lấy lịch quay từ nguồn → `POST /internal/v1/schedule-sync/` (kiểm tra cả lô) |
| `02-live-results.json` | mỗi 3 phút, chỉ trong khung quay | Lấy số đang về → `POST /internal/v1/result-observations/` với `kind: "live"` |
| `03-final-results.json` | mỗi 5 phút sau giờ quay | Lấy bảng giải chính thức → `POST` với `kind: "final"`, lọc phản hồi 409/422/423 để xử lý |
| `04-health-alert.json` | mỗi 2 giờ | `GET /internal/v1/health/` → gửi cảnh báo khi trễ dữ liệu, có kỳ disputed, `publish_enabled = 0` hoặc `index_enabled = 0` (đang deploy tối) |

**Lưu ý dấu `/` cuối:** site đặt `trailingSlash: 'always'`, nên mọi URL nội bộ phải có `/` cuối;
thiếu slash Astro trả `308` và n8n phải theo redirect. Workflow trong thư mục này đã dùng URL có slash.

## Biến môi trường của n8n

Khai báo trong n8n (Settings → Variables) hoặc file `.env` của n8n:

| Biến | Ý nghĩa |
|---|---|
| `XOSO_BASE_URL` | `https://<worker>.<subdomain>` (không có dấu `/` cuối) |
| `XOSO_INGEST_TOKEN` | token ghi dữ liệu, khớp secret `INGEST_TOKEN` của Worker |
| `XOSO_OPERATOR_TOKEN` | token vận hành, khớp secret `OPERATOR_TOKEN` |
| `XOSO_SCHEDULE_SOURCE_URL` | endpoint JSON lịch quay của nguồn |
| `XOSO_LIVE_SOURCE_URL` | endpoint số đang về |
| `XOSO_FINAL_SOURCE_URL` | endpoint bảng giải chính thức |
| `XOSO_ALERT_WEBHOOK_URL` | webhook nhận cảnh báo (Slack/Discord/Telegram) |

Không đặt token trong file workflow. Token chỉ đi qua header `Authorization: Bearer …`.

## Quy ước gửi dữ liệu

- `Idempotency-Key` **cố định theo nội dung** (`final:<đài>:<sản phẩm>:<ngày>:<hash bộ số>`), nhờ vậy
  retry không tạo bản trùng; gửi lại cùng key với payload khác sẽ nhận **409**.
- `prizes` luôn là chuỗi (`"09"`, `"001234"`) — Code node đã `String(n)` trước khi gửi.
- `observed_at` là ISO-8601 UTC (`...Z`). Giờ VN chỉ dùng để quyết định *khi nào* chạy.
- Nguồn authoritative (`src-official`) tự xác nhận kỳ; nguồn thường chỉ hiện "Chưa đối soát" cho tới
  khi có nguồn thứ hai trùng hash.

# Nội quy kỹ thuật

Đọc `docs/plan.md` trước khi sửa code.

## Bắt buộc

1. **Số trúng là TEXT.** Không bao giờ chuyển sang number/INTEGER: `09`, `007`, `001234` phải giữ nguyên số 0.
2. **Mọi phép tính ngày dùng `src/lib/time.ts`** (`todayInVN`, `isoWeekday`, `addDays`). Không dùng `new Date()` trực tiếp để lấy "hôm nay".
3. **Trang ngày index + self-canonical**, kể cả hôm nay. Không thêm `noindex` cho trang ngày. Luật index tập trung ở `src/lib/policy.ts`.
4. **Dò vé dùng POST**, không sinh URL kết quả; không ghi log số vé.
5. **Không có admin/CMS.** Kỳ quay được xác nhận bằng luật (nguồn authoritative hoặc 2 nguồn trùng hash).
6. **Ghi D1 nguyên tử:** `db.batch()` + kiểm `meta.changes`; không tin `success: true` một mình.
7. **Không commit** `.dev.vars`, `.env`, bản export D1, hay token.
8. Fixture phải có nhãn rõ là dữ liệu **giả**.

## Tên tài nguyên Cloudflare

`xoso-web` (Worker), `xoso-db` (D1). Không chạm `fieldnotes-*` (project khác cùng account).

## Kiểm tra trước khi kết thúc

```bash
npm test      # 32+ test
npm run build # astro build phải xanh
```

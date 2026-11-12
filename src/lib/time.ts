/**
 * Mọi phép tính ngày/giờ đều theo Asia/Ho_Chi_Minh.
 * Ngày lưu dạng YYYY-MM-DD; không bao giờ dùng new Date() trực tiếp để lấy "hôm nay".
 */

export const VN_TZ = 'Asia/Ho_Chi_Minh';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function todayInVN(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Giờ hiện tại theo giờ Việt Nam, dạng HH:mm. */
export function timeInVN(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

/** Chuỗi YYYY-MM-DD có hợp lệ và là ngày có thật không. */
export function isISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Thứ theo ISO 1..7 (1 = Thứ Hai) của một ngày YYYY-MM-DD, không phụ thuộc múi giờ máy chạy. */
export function isoWeekday(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Chủ Nhật
  return wd === 0 ? 7 : wd;
}

/** Cộng/trừ ngày trên chuỗi YYYY-MM-DD. */
export function addDays(dateISO: string, delta: number): string {
  const [y, m, d] = dateISO.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

/** 04/11/2026 */
export function formatVNDate(dateISO: string): string {
  if (!isISODate(dateISO)) return dateISO;
  const [y, m, d] = dateISO.split('-') as [string, string, string];
  return `${d}/${m}/${y}`;
}

/** Thứ Tư, 04/11/2026 */
export function formatVNDateLong(dateISO: string): string {
  if (!isISODate(dateISO)) return dateISO;
  return `${weekdayName(isoWeekday(dateISO))}, ${formatVNDate(dateISO)}`;
}

/** 1..7 -> "Thứ Hai".."Chủ Nhật" */
export function weekdayName(iso: number): string {
  return WEEKDAY_NAMES[iso - 1] ?? '';
}

/** "16:10" -> "16:10"; dùng để so sánh chuỗi giờ địa phương. */
export function normalizeLocalTime(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return value.trim();
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
}

/** Số phút trễ so với thời điểm cập nhật (dùng cho nhãn "cập nhật lúc"). */
export function minutesSince(iso: string, now: Date = new Date()): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((now.getTime() - t) / 60000));
}

/** Hiển thị giờ Việt Nam từ một timestamp ISO. */
export function formatVNTimeFromISO(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN_TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(t));
}

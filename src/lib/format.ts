/** Nhãn trạng thái, thứ tự giải và các phép định dạng số trúng. */

import type { DrawStatus, PrizeRule } from './types';

export const STATUS_LABEL: Record<DrawStatus, string> = {
  scheduled: 'Chờ mở thưởng',
  live: 'Đang cập nhật',
  pending_confirmation: 'Chưa đối soát',
  confirmed: 'Đã xác nhận',
  disputed: 'Đang đối soát',
};

export const STATUS_NOTE: Record<DrawStatus, string> = {
  scheduled: 'Đài này chưa quay hoặc chưa có số.',
  live: 'Đang cập nhật từng giải trong lúc quay.',
  pending_confirmation: 'Có số nhưng chưa đủ điều kiện đối soát — không dùng để dò vé.',
  confirmed: 'Bản đã đủ cơ cấu giải và qua luật đối soát.',
  disputed: 'Đang đối soát lại; tạm ngưng dò vé cho kỳ này.',
};

export function statusLabel(status: DrawStatus): string {
  return STATUS_LABEL[status] ?? status;
}

/** Chỉ kỳ đã xác nhận mới được dùng cho công cụ dò vé. */
export function isTicketCheckable(status: DrawStatus): boolean {
  return status === 'confirmed';
}

/** Số trúng phải là chuỗi chỉ gồm chữ số; nếu không, trả false để chặn dữ liệu hỏng. */
export function isPrizeNumber(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

/** Một số hợp lệ với cơ cấu giải: đúng số chữ số. */
export function fitsDigits(value: string, digits: number): boolean {
  return isPrizeNumber(value) && value.length === digits;
}

export interface PrizeRow {
  code: string;
  label: string;
  numbers: string[];
  expected: number;
  digits: number;
  complete: boolean;
}

/** Ghép prizes với prize_rules để render bảng theo đúng thứ tự giải. */
export function buildPrizeRows(
  prizes: Record<string, string[]>,
  rules: PrizeRule[],
): PrizeRow[] {
  return [...rules]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((rule) => {
      const numbers = prizes[rule.prize_code] ?? [];
      return {
        code: rule.prize_code,
        label: rule.label,
        numbers,
        expected: rule.count,
        digits: rule.digits,
        complete: numbers.length >= rule.count,
      };
    });
}

/** Kỳ có đủ toàn bộ cơ cấu giải chưa (dùng cho luật xác nhận và nhãn trạng thái). */
export function isComplete(prizes: Record<string, string[]>, rules: PrizeRule[]): boolean {
  return rules.every((rule) => (prizes[rule.prize_code]?.length ?? 0) >= rule.count);
}

/** Đếm số giải đã có / tổng số giải, ví dụ "5/9". */
export function completeness(prizes: Record<string, string[]>, rules: PrizeRule[]): string {
  const filled = rules.filter((rule) => (prizes[rule.prize_code]?.length ?? 0) >= rule.count).length;
  return `${filled}/${rules.length}`;
}

/** Nối các số để hiển thị, giữ nguyên số 0 ở đầu. */
export function joinNumbers(numbers: string[]): string {
  return numbers.join(' · ');
}

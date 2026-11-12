import { describe, expect, it } from 'vitest';
import {
  buildPrizeRows,
  completeness,
  fitsDigits,
  isComplete,
  isPrizeNumber,
  isTicketCheckable,
  joinNumbers,
  statusLabel,
} from '../src/lib/format';
import type { PrizeRule } from '../src/lib/types';

const rules: PrizeRule[] = [
  { version: 1, prize_code: 'special', label: 'Giải Đặc Biệt', ordinal: 1, count: 1, digits: 6 },
  { version: 1, prize_code: 'seventh', label: 'Giải Bảy', ordinal: 8, count: 1, digits: 3 },
  { version: 1, prize_code: 'eighth', label: 'Giải Tám', ordinal: 9, count: 1, digits: 2 },
];

describe('số trúng luôn là chuỗi', () => {
  it('giữ số 0 ở đầu', () => {
    expect(joinNumbers(['09', '007'])).toBe('09 · 007');
  });

  it('từ chối số không phải chuỗi chữ số', () => {
    expect(isPrizeNumber('09')).toBe(true);
    expect(isPrizeNumber(9)).toBe(false);
    expect(isPrizeNumber('')).toBe(false);
    expect(isPrizeNumber('0a')).toBe(false);
  });

  it('kiểm tra số chữ số theo cơ cấu giải', () => {
    expect(fitsDigits('09', 2)).toBe(true);
    expect(fitsDigits('9', 2)).toBe(false);
    expect(fitsDigits('001234', 6)).toBe(true);
  });
});

describe('buildPrizeRows', () => {
  it('sắp theo ordinal và báo thiếu số', () => {
    const rows = buildPrizeRows({ special: ['001234'], seventh: ['007'] }, rules);
    expect(rows.map((r) => r.code)).toEqual(['special', 'seventh', 'eighth']);
    expect(rows[0]?.numbers).toEqual(['001234']);
    expect(rows[2]?.numbers).toEqual([]);
    expect(rows[2]?.complete).toBe(false);
  });
});

describe('mức đầy đủ của kỳ', () => {
  it('isComplete đúng khi thiếu giải', () => {
    expect(isComplete({ special: ['001234'], seventh: ['007'], eighth: ['09'] }, rules)).toBe(true);
    expect(isComplete({ special: ['001234'], seventh: ['007'] }, rules)).toBe(false);
  });

  it('completeness trả dạng x/y', () => {
    expect(completeness({ special: ['001234'] }, rules)).toBe('1/3');
  });
});

describe('trạng thái', () => {
  it('nhãn tiếng Việt', () => {
    expect(statusLabel('confirmed')).toBe('Đã xác nhận');
    expect(statusLabel('pending_confirmation')).toBe('Chưa đối soát');
    expect(statusLabel('scheduled')).toBe('Chờ mở thưởng');
  });

  it('chỉ kỳ đã xác nhận mới được dò vé', () => {
    expect(isTicketCheckable('confirmed')).toBe(true);
    expect(isTicketCheckable('pending_confirmation')).toBe(false);
    expect(isTicketCheckable('disputed')).toBe(false);
    expect(isTicketCheckable('live')).toBe(false);
  });
});

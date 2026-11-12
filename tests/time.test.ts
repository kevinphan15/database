import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatVNDate,
  formatVNDateLong,
  isISODate,
  isoWeekday,
  normalizeLocalTime,
  todayInVN,
  weekdayName,
} from '../src/lib/time';

describe('todayInVN — ranh giới ngày theo giờ Việt Nam (UTC+7)', () => {
  it('16:59 UTC vẫn là ngày hôm trước ở VN', () => {
    expect(todayInVN(new Date('2026-11-12T16:59:00Z'))).toBe('2026-11-12');
  });

  it('17:00 UTC đã sang ngày mới ở VN', () => {
    expect(todayInVN(new Date('2026-11-12T17:00:00Z'))).toBe('2026-11-13');
  });

  it('00:30 giờ VN là 17:30 UTC ngày hôm trước', () => {
    expect(todayInVN(new Date('2026-11-12T17:30:00Z'))).toBe('2026-11-13');
  });

  it('không phụ thuộc múi giờ máy chạy', () => {
    const sameMoment = new Date('2026-03-01T03:00:00Z');
    expect(todayInVN(sameMoment)).toBe('2026-03-01');
  });
});

describe('isoWeekday', () => {
  it('2026-11-11 là thứ Tư (ISO 3)', () => {
    expect(isoWeekday('2026-11-11')).toBe(3);
  });

  it('2026-11-08 là Chủ Nhật (ISO 7)', () => {
    expect(isoWeekday('2026-11-08')).toBe(7);
  });

  it('2026-11-12 là thứ Năm (ISO 4)', () => {
    expect(isoWeekday('2026-11-12')).toBe(4);
  });
});

describe('addDays', () => {
  it('qua tháng và qua năm', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });
});

describe('isISODate', () => {
  it('nhận ngày hợp lệ', () => {
    expect(isISODate('2026-11-04')).toBe(true);
    expect(isISODate('2024-02-29')).toBe(true);
  });

  it('từ chối ngày không có thật và sai định dạng', () => {
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('04/11/2026')).toBe(false);
    expect(isISODate('2026-1-4')).toBe(false);
  });
});

describe('định dạng hiển thị', () => {
  it('dd/mm/yyyy và kèm thứ', () => {
    expect(formatVNDate('2026-11-04')).toBe('04/11/2026');
    expect(formatVNDateLong('2026-11-11')).toBe('Thứ Tư, 11/11/2026');
  });

  it('tên thứ theo ISO', () => {
    expect(weekdayName(1)).toBe('Thứ Hai');
    expect(weekdayName(7)).toBe('Chủ Nhật');
  });

  it('chuẩn hoá giờ quay', () => {
    expect(normalizeLocalTime('16:10')).toBe('16:10');
    expect(normalizeLocalTime('9:05')).toBe('09:05');
  });
});

import { describe, expect, it } from 'vitest';
import { parseScheduleSync } from '../src/lib/schedule-sync';

const validRule = {
  station_code: 'DONG_NAI',
  product_code: 'xs-mn',
  iso_weekday: 3,
  local_time: '16:10',
  from_date: '2026-01-01',
};

describe('parseScheduleSync', () => {
  it('nhận lô hợp lệ, to_date mặc định null', () => {
    const parsed = parseScheduleSync({ rules: [validRule] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.rules[0]).toMatchObject({ iso_weekday: 3, local_time: '16:10', to_date: null });
      expect(parsed.value.exceptions).toEqual([]);
    }
  });

  it('nhận exception move có new_date', () => {
    const parsed = parseScheduleSync({
      exceptions: [
        {
          station_code: 'DONG_NAI',
          product_code: 'xs-mn',
          exception_date: '2026-12-30',
          action: 'move',
          new_date: '2026-12-31',
          new_time: '16:10',
        },
      ],
    });
    expect(parsed.ok).toBe(true);
  });

  it('từ chối ngày không có thật và giờ sai', () => {
    const parsed = parseScheduleSync({
      rules: [{ ...validRule, from_date: '2026-02-30', local_time: '25:00', iso_weekday: 9 }],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      const text = parsed.errors.join(' ');
      expect(text).toMatch(/from_date/);
      expect(text).toMatch(/local_time/);
      expect(text).toMatch(/iso_weekday/);
    }
  });

  it('từ chối action=move thiếu new_date', () => {
    const parsed = parseScheduleSync({
      exceptions: [
        {
          station_code: 'DONG_NAI',
          product_code: 'xs-mn',
          exception_date: '2026-12-30',
          action: 'move',
        },
      ],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(' ')).toMatch(/cần new_date/);
  });

  it('từ chối lô rỗng và payload không phải object', () => {
    expect(parseScheduleSync({}).ok).toBe(false);
    expect(parseScheduleSync(null).ok).toBe(false);
  });
});

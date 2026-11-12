import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../src/lib/fixture';
import { confirmedDraws, coverageLabel, specialStats } from '../src/lib/stats';

const station = fixtureDataset.stations[0]!;

describe('thống kê giải đặc biệt', () => {
  it('chỉ tính kỳ đã xác nhận', () => {
    const draws = confirmedDraws(fixtureDataset, station.station_code);
    expect(draws).toHaveLength(1);
    expect(draws[0]?.draw_date).toBe('2026-11-04');
  });

  it('công bố số kỳ thực có', () => {
    const stat = specialStats(fixtureDataset, station, 30);
    expect(stat.totalPeriods).toBe(1);
    expect(stat.periodsWithData).toBe(1);
    expect(coverageLabel(stat)).toBe('1/1 kỳ có dữ liệu');
    expect(stat.windowLabel).toContain('30 kỳ');
  });

  it('giữ nguyên số 0 ở đầu trong danh sách kỳ', () => {
    const stat = specialStats(fixtureDataset, station, 30);
    expect(stat.items[0]?.number).toBe('001234');
  });

  it('đếm chữ số cuối', () => {
    const stat = specialStats(fixtureDataset, station, 30);
    expect(stat.lastDigitFrequency).toEqual([{ digit: '4', count: 1 }]);
  });

  it('không tính kỳ chưa đối soát dù có số', () => {
    const stat = specialStats(fixtureDataset, station, 30);
    expect(stat.items.some((item) => item.date === '2026-11-11')).toBe(false);
  });
});

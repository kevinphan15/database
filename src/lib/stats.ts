/**
 * Thống kê chỉ tính trên kỳ ĐÃ XÁC NHẬN và luôn công bố độ đầy đủ của tập dữ liệu
 * (ví dụ "28/30 kỳ có dữ liệu"), đúng yêu cầu nghiệm thu nội dung.
 */

import type { Dataset, Draw, Station } from './types';

export interface SpecialStat {
  totalPeriods: number;
  periodsWithData: number;
  windowLabel: string;
  stationCode: string;
  items: { date: string; number: string }[];
  lastDigitFrequency: { digit: string; count: number }[];
}

export function confirmedDraws(ds: Dataset, stationCode: string): Draw[] {
  return ds.draws
    .filter((d) => d.station_code === stationCode && d.status === 'confirmed')
    .sort((a, b) => b.draw_date.localeCompare(a.draw_date));
}

export function specialStats(ds: Dataset, station: Station, limit = 30): SpecialStat {
  const confirmed = confirmedDraws(ds, station.station_code);
  const window = confirmed.slice(0, limit);

  const items = window
    .map((draw) => {
      const number = draw.prizes.special?.[0];
      return number ? { date: draw.draw_date, number } : null;
    })
    .filter((item): item is { date: string; number: string } => item !== null);

  const counts = new Map<string, number>();
  for (const item of items) {
    const digit = item.number.slice(-1);
    counts.set(digit, (counts.get(digit) ?? 0) + 1);
  }

  return {
    totalPeriods: window.length,
    periodsWithData: items.length,
    windowLabel: `${limit} kỳ đã xác nhận gần nhất`,
    stationCode: station.station_code,
    items,
    lastDigitFrequency: [...counts.entries()]
      .map(([digit, count]) => ({ digit, count }))
      .sort((a, b) => b.count - a.count || a.digit.localeCompare(b.digit)),
  };
}

/** Nhãn độ đầy đủ, ví dụ "28/30 kỳ có dữ liệu". */
export function coverageLabel(stat: SpecialStat): string {
  return `${stat.periodsWithData}/${stat.totalPeriods} kỳ có dữ liệu`;
}

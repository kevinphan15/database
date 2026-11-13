/** Hàm chọn dữ liệu thuần (không I/O) để trang gọn và test được. */

import { addDays, isoWeekday } from './time';
import type { Dataset, Draw, PrizeRule, Region, ScheduleRule, Station } from './types';

export function regionBySlug(ds: Dataset, slug: string): Region | null {
  return ds.regions.find((r) => r.slug === slug) ?? null;
}

export function stationByPath(
  ds: Dataset,
  regionSlug: string,
  stationSlug: string,
): { region: Region; station: Station } | null {
  const region = regionBySlug(ds, regionSlug);
  if (!region) return null;
  const station = ds.stations.find((s) => s.region_code === region.code && s.slug === stationSlug);
  return station ? { region, station } : null;
}

export function stationsOfRegion(ds: Dataset, regionCode: string): Station[] {
  return ds.stations.filter((s) => s.region_code === regionCode && s.status === 'active');
}

/** Kỳ của một đài, mới nhất trước. */
export function drawsOfStation(ds: Dataset, stationCode: string): Draw[] {
  return ds.draws
    .filter((d) => d.station_code === stationCode)
    .sort((a, b) => b.draw_date.localeCompare(a.draw_date));
}

export function latestDraw(ds: Dataset, stationCode: string): Draw | null {
  return drawsOfStation(ds, stationCode)[0] ?? null;
}

export function drawOnDate(ds: Dataset, stationCode: string, date: string): Draw | null {
  return ds.draws.find((d) => d.station_code === stationCode && d.draw_date === date) ?? null;
}

export function rulesFor(ds: Dataset, version: number): PrizeRule[] {
  const rules = ds.prize_rules.filter((r) => r.version === version);
  return rules.length > 0 ? rules : ds.prize_rules.filter((r) => r.version === ds.prize_rule_version);
}

export function scheduleOfStation(ds: Dataset, stationCode: string): ScheduleRule[] {
  return ds.schedule
    .filter((s) => s.station_code === stationCode)
    .sort((a, b) => a.iso_weekday - b.iso_weekday);
}

function inEffect(date: string, rule: ScheduleRule): boolean {
  if (rule.from_date && date < rule.from_date) return false;
  if (rule.to_date && date > rule.to_date) return false;
  return true;
}

/** Ngày này đài có quay không (đã áp dụng ngoại lệ). */
export function isDrawDay(ds: Dataset, stationCode: string, date: string): boolean {
  const exception = ds.exceptions.find(
    (e) => e.station_code === stationCode && e.exception_date === date,
  );
  if (exception) return exception.action === 'move';

  const weekday = isoWeekday(date);
  return scheduleOfStation(ds, stationCode).some(
    (rule) => rule.iso_weekday === weekday && inEffect(date, rule),
  );
}

export interface DrawingStation {
  station: Station;
  region: Region;
  localTime: string;
  draw: Draw | null;
}

/** Các đài quay trong một ngày, sắp theo giờ. */
export function stationsDrawingOn(ds: Dataset, date: string, regionCode?: string): DrawingStation[] {
  const result: DrawingStation[] = [];
  for (const station of ds.stations) {
    if (regionCode && station.region_code !== regionCode) continue;
    if (!isDrawDay(ds, station.station_code, date)) continue;
    const region = ds.regions.find((r) => r.code === station.region_code);
    if (!region) continue;
    const rule = scheduleOfStation(ds, station.station_code).find(
      (s) => s.iso_weekday === isoWeekday(date) && inEffect(date, s),
    );
    result.push({
      station,
      region,
      localTime: rule?.local_time ?? '',
      draw: drawOnDate(ds, station.station_code, date),
    });
  }
  return result.sort((a, b) => a.localTime.localeCompare(b.localTime));
}

/** Ngày kỳ gần nhất của từng đài trong một miền. */
export function latestPerStation(ds: Dataset, regionCode: string): { station: Station; draw: Draw | null }[] {
  return stationsOfRegion(ds, regionCode).map((station) => ({
    station,
    draw: latestDraw(ds, station.station_code),
  }));
}

/** Số ngày tối đa để tìm kỳ trước/sau gần nhất. */
const NEAREST_LIMIT = 14;

/** Kỳ trước hoặc sau gần nhất có lịch quay (để điều hướng ngày). */
export function nearestDrawDate(
  ds: Dataset,
  date: string,
  direction: 1 | -1,
  opts: { stationCode?: string; regionCode?: string } = {},
): string | null {
  for (let i = 1; i <= NEAREST_LIMIT; i += 1) {
    const candidate = addDays(date, i * direction);
    const hit = opts.stationCode
      ? isDrawDay(ds, opts.stationCode, candidate)
      : stationsDrawingOn(ds, candidate, opts.regionCode).length > 0;
    if (hit) return candidate;
  }
  return null;
}

/**
 * Nạp và KIỂM TRA fixture. Không dùng thư viện ngoài: chỉ kiểm tra hình dạng dữ liệu
 * và từ chối mọi số trúng không phải chuỗi — đây là chốt chặn để không mất số 0 ở đầu.
 */

import raw from '../data/fixture.json';
import { isISODate } from './time';
import type { Dataset, Draw, DrawStatus, PrizeRule } from './types';

const STATUSES: DrawStatus[] = ['scheduled', 'live', 'pending_confirmation', 'confirmed', 'disputed'];

function fail(path: string, message: string): never {
  throw new Error(`[fixture] ${path}: ${message}`);
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'phải là mảng');
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'phải là chuỗi khác rỗng');
  return value;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'phải là số');
  return value;
}

function parsePrizes(value: unknown, path: string): Record<string, string[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'prizes phải là object prize_code -> mảng số');
  }
  const out: Record<string, string[]> = {};
  for (const [code, numbers] of Object.entries(value as Record<string, unknown>)) {
    const list = asArray(numbers, `${path}.${code}`);
    out[code] = list.map((n, i) => {
      const at = `${path}.${code}[${i}]`;
      // Số trúng bắt buộc là CHUỖI chữ số: nếu là number thì "09" đã mất số 0 trước khi tới đây.
      if (typeof n !== 'string' || n.length === 0 || !/^\d+$/.test(n)) {
        fail(at, `${JSON.stringify(n)} phải là chuỗi chữ số (giữ số 0 ở đầu), không nhận kiểu số`);
      }
      return n;
    });
  }
  return out;
}

export function validateDataset(input: unknown): Dataset {
  if (typeof input !== 'object' || input === null) fail('root', 'phải là object');

  const root = input as Record<string, unknown>;
  const regions = asArray(root.regions, 'regions').map((r, i) => {
    const o = r as Record<string, unknown>;
    return {
      code: asString(o.code, `regions[${i}].code`),
      name: asString(o.name, `regions[${i}].name`),
      slug: asString(o.slug, `regions[${i}].slug`),
    };
  });

  const stations = asArray(root.stations, 'stations').map((s, i) => {
    const o = s as Record<string, unknown>;
    return {
      station_code: asString(o.station_code, `stations[${i}].station_code`),
      region_code: asString(o.region_code, `stations[${i}].region_code`),
      slug: asString(o.slug, `stations[${i}].slug`),
      name: asString(o.name, `stations[${i}].name`),
      short_name: typeof o.short_name === 'string' ? o.short_name : null,
      status: typeof o.status === 'string' ? o.status : 'active',
      redistribution_allowed: asNumber(o.redistribution_allowed ?? 0, `stations[${i}].redistribution_allowed`),
    };
  });

  const prizeRules = asArray(root.prize_rules, 'prize_rules').map((p, i) => {
    const o = p as Record<string, unknown>;
    return {
      version: asNumber(o.version, `prize_rules[${i}].version`),
      prize_code: asString(o.prize_code, `prize_rules[${i}].prize_code`),
      label: asString(o.label, `prize_rules[${i}].label`),
      ordinal: asNumber(o.ordinal, `prize_rules[${i}].ordinal`),
      count: asNumber(o.count, `prize_rules[${i}].count`),
      digits: asNumber(o.digits, `prize_rules[${i}].digits`),
    } satisfies PrizeRule;
  });

  const schedule = asArray(root.schedule ?? [], 'schedule').map((s, i) => {
    const o = s as Record<string, unknown>;
    return {
      station_code: asString(o.station_code, `schedule[${i}].station_code`),
      product_code: asString(o.product_code, `schedule[${i}].product_code`),
      iso_weekday: asNumber(o.iso_weekday, `schedule[${i}].iso_weekday`),
      local_time: asString(o.local_time, `schedule[${i}].local_time`),
      from_date: asString(o.from_date, `schedule[${i}].from_date`),
      to_date: typeof o.to_date === 'string' ? o.to_date : null,
    };
  });

  const exceptions = asArray(root.exceptions ?? [], 'exceptions').map((e, i) => {
    const o = e as Record<string, unknown>;
    const action = o.action === 'skip' || o.action === 'move' ? o.action : fail(`exceptions[${i}].action`, 'phải là skip hoặc move');
    return {
      station_code: asString(o.station_code, `exceptions[${i}].station_code`),
      product_code: asString(o.product_code, `exceptions[${i}].product_code`),
      exception_date: asString(o.exception_date, `exceptions[${i}].exception_date`),
      action,
      new_date: typeof o.new_date === 'string' ? o.new_date : null,
      new_time: typeof o.new_time === 'string' ? o.new_time : null,
    };
  });

  const draws = asArray(root.draws, 'draws').map((d, i) => {
    const o = d as Record<string, unknown>;
    const drawDate = asString(o.draw_date, `draws[${i}].draw_date`);
    if (!isISODate(drawDate)) fail(`draws[${i}].draw_date`, 'phải là YYYY-MM-DD hợp lệ');
    const status = STATUSES.includes(o.status as DrawStatus)
      ? (o.status as DrawStatus)
      : fail(`draws[${i}].status`, `không hợp lệ: ${String(o.status)}`);
    return {
      draw_key: asString(o.draw_key, `draws[${i}].draw_key`),
      station_code: asString(o.station_code, `draws[${i}].station_code`),
      product_code: asString(o.product_code, `draws[${i}].product_code`),
      draw_date: drawDate,
      period_code: typeof o.period_code === 'string' ? o.period_code : null,
      status,
      prize_rule_version: asNumber(o.prize_rule_version, `draws[${i}].prize_rule_version`),
      updated_at: asString(o.updated_at, `draws[${i}].updated_at`),
      is_correction: o.is_correction === true,
      prizes: parsePrizes(o.prizes, `draws[${i}].prizes`),
    } satisfies Draw;
  });

  return {
    notice: asString(root.notice, 'notice'),
    is_fixture: root.is_fixture === true,
    index_enabled: root.index_enabled !== false,
    product_code: asString(root.product_code, 'product_code'),
    prize_rule_version: asNumber(root.prize_rule_version, 'prize_rule_version'),
    regions,
    stations,
    prize_rules: prizeRules,
    schedule,
    exceptions,
    draws,
  };
}

/** Fixture đã kiểm tra — dùng khi chưa có D1 hoặc D1 rỗng. */
export const fixtureDataset: Dataset = validateDataset(raw);

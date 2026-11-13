/**
 * API đọc công khai: /api/v1/results, /api/v1/schedule, /api/v1/ticket-check.
 * Phần này thuần logic (không I/O) để test được toàn bộ payload.
 */

import { checkTicket } from './ticket';
import { drawOnDate, drawsOfStation, rulesFor, scheduleOfStation } from './selectors';
import { isISODate, isoWeekday } from './time';
import type { Dataset, Draw, Station } from './types';

export interface ApiReply {
  status: number;
  body: Record<string, unknown>;
}

const VN_OFFSET_MIN = 7 * 60;
/** Cửa sổ theo dõi quanh giờ quay: mở trước 10 phút, đóng sau 120 phút. */
const WINDOW_BEFORE_MIN = 10;
const WINDOW_AFTER_MIN = 120;
/** Bảng giải cuối thường có sau giờ quay khoảng 90 phút. */
const EXPECTED_FINAL_AFTER_MIN = 90;

function isoSecond(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function shift(iso: string, minutes: number): string {
  return isoSecond(new Date(Date.parse(iso) + minutes * 60_000));
}

/** Lần quay kế tiếp (UTC) của một rule lịch, null nếu rule sai định dạng. */
export function nextDrawAt(weekday: number, localTime: string, now: Date): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(localTime.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const nowVn = new Date(now.getTime() + VN_OFFSET_MIN * 60_000);
  for (let add = 0; add <= 7; add += 1) {
    const wall = Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate() + add, hours, minutes);
    if (isoWeekday(new Date(wall).toISOString().slice(0, 10)) !== weekday) continue;
    const utc = wall - VN_OFFSET_MIN * 60_000;
    if (utc > now.getTime()) return isoSecond(new Date(utc));
  }
  return null;
}

function stationRef(ds: Dataset, station: Station) {
  const region = ds.regions.find((r) => r.code === station.region_code);
  return {
    code: station.station_code,
    slug: station.slug,
    name: station.name,
    region: region ? { code: region.code, slug: region.slug, name: region.name } : null,
  };
}

function serializedDraw(ds: Dataset, draw: Draw) {
  const station = ds.stations.find((s) => s.station_code === draw.station_code);
  return {
    draw_key: draw.draw_key,
    draw_date: draw.draw_date,
    status: draw.status,
    period_code: draw.period_code ?? null,
    prize_rule_version: draw.prize_rule_version,
    updated_at: draw.updated_at,
    is_correction: draw.is_correction === true,
    prizes: draw.prizes,
    station: station ? stationRef(ds, station) : null,
  };
}

export interface ResultsParams {
  /** slug đài, ví dụ "dong-nai" */
  station?: string | null;
  /** YYYY-MM-DD */
  date?: string | null;
  limit?: number;
}

export function resultsPayload(ds: Dataset, params: ResultsParams = {}): ApiReply {
  const requested = params.limit ?? 20;
  const limit = Math.min(Math.max(Number.isFinite(requested) ? Math.trunc(requested) : 20, 1), 100);

  const station = params.station ? ds.stations.find((s) => s.slug === params.station) : null;
  if (params.station && !station) {
    return { status: 404, body: { ok: false, error: 'unknown_station' } };
  }

  const date = params.date?.trim() || null;
  if (date && !isISODate(date)) {
    return { status: 422, body: { ok: false, error: 'invalid_date', detail: 'Dùng YYYY-MM-DD.' } };
  }

  const pool = station
    ? drawsOfStation(ds, station.station_code)
    : [...ds.draws].sort((a, b) => b.draw_date.localeCompare(a.draw_date));
  const filtered = date ? pool.filter((draw) => draw.draw_date === date) : pool;
  const items = filtered.slice(0, limit).map((draw) => serializedDraw(ds, draw));

  return { status: 200, body: { ok: true, count: items.length, limit, items } };
}

export function schedulePayload(ds: Dataset, nowISO: string): ApiReply {
  const now = new Date(nowISO);
  const items = ds.stations
    .filter((station) => station.status === 'active')
    .flatMap((station) => {
      const rules = scheduleOfStation(ds, station.station_code);
      if (rules.length === 0) return [];
      const next = rules
        .map((rule) => nextDrawAt(rule.iso_weekday, rule.local_time, now))
        .filter((value): value is string => value !== null)
        .sort()[0] ?? null;

      return [
        {
          station: stationRef(ds, station),
          rules: rules.map((rule) => ({
            iso_weekday: rule.iso_weekday,
            local_time: rule.local_time,
            from_date: rule.from_date,
            to_date: rule.to_date ?? null,
          })),
          next_draw_at_utc: next,
          window_start_utc: next ? shift(next, -WINDOW_BEFORE_MIN) : null,
          expected_final_at_utc: next ? shift(next, EXPECTED_FINAL_AFTER_MIN) : null,
          window_end_utc: next ? shift(next, WINDOW_AFTER_MIN) : null,
        },
      ];
    });

  return { status: 200, body: { ok: true, generated_at: isoSecond(now), count: items.length, items } };
}

export function ticketCheckPayload(ds: Dataset, input: unknown): ApiReply {
  const raw =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null;
  if (!raw) {
    return { status: 422, body: { ok: false, error: 'invalid_payload', detail: 'Gửi JSON object.' } };
  }

  const stationSlug =
    typeof raw.station === 'string' ? raw.station : typeof raw.dai === 'string' ? raw.dai : '';
  const date = typeof raw.date === 'string' ? raw.date : typeof raw.ngay === 'string' ? raw.ngay : '';
  const ticket = typeof raw.ticket === 'string' ? raw.ticket : typeof raw.so === 'string' ? raw.so : '';

  const station = ds.stations.find((s) => s.slug === stationSlug);
  if (!station) {
    return {
      status: 422,
      body: { ok: false, error: 'unknown_station', detail: 'station là slug đài, ví dụ "dong-nai".' },
    };
  }
  if (!isISODate(date)) {
    return { status: 422, body: { ok: false, error: 'invalid_date', detail: 'date dạng YYYY-MM-DD.' } };
  }

  const draw = drawOnDate(ds, station.station_code, date);
  const outcome = checkTicket(ticket, draw, rulesFor(ds, draw?.prize_rule_version ?? ds.prize_rule_version));
  if (outcome.kind === 'invalid') {
    return { status: 422, body: { ok: false, error: 'invalid_ticket', detail: outcome.message } };
  }

  return {
    status: 200,
    body: {
      ok: true,
      station: stationRef(ds, station),
      draw_date: date,
      status: draw?.status ?? 'scheduled',
      result: outcome,
    },
  };
}

/**
 * Luật xác nhận A + kiểm tra payload cho API ingest.
 * Phần này thuần logic (không I/O) để test được toàn bộ ma trận trạng thái.
 */

import { isISODate } from './time';
import type { DrawStatus } from './types';

export type ObservationKind = 'live' | 'final';

export interface Observation {
  station_code: string;
  product_code: string;
  draw_date: string;
  kind: ObservationKind;
  source_id: string;
  prizes: Record<string, string[]>;
  observed_at: string;
  source_updated_at?: string | null;
  period_code?: string | null;
  prize_rule_version?: number;
}

export function drawKey(obs: Pick<Observation, 'station_code' | 'product_code' | 'draw_date'>): string {
  return `${obs.station_code}:${obs.product_code}:${obs.draw_date}`;
}

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const PRIZE_CODE_RE = /^[a-z_]{2,20}$/;
const PRIZE_NUMBER_RE = /^\d{2,6}$/;
const CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;

function optionalIso(value: unknown, field: string, errors: string[]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && ISO_UTC_RE.test(value)) return value;
  errors.push(`${field} phải là ISO-8601 UTC (…Z)`);
  return null;
}

function optionalText(
  value: unknown,
  field: string,
  errors: string[],
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.length <= maxLength) return value;
  errors.push(`${field} không hợp lệ`);
  return null;
}

function optionalRuleVersion(value: unknown, errors: string[]): number {
  if (value === undefined || value === null) return 1;
  if (Number.isInteger(value) && (value as number) >= 1) return value as number;
  errors.push('prize_rule_version phải là số nguyên ≥ 1');
  return 1;
}

type ParsedObservation =
  | { ok: true; value: Observation }
  | { ok: false; errors: string[] };

/** Kiểm tra payload của n8n. Không tự sửa dữ liệu — sai là từ chối cả request. */
export function parseObservation(input: unknown): ParsedObservation {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['payload phải là object JSON'] };
  }
  const raw = input as Record<string, unknown>;

  const code = (field: string): string => {
    const value = raw[field];
    if (typeof value !== 'string' || !CODE_RE.test(value)) {
      errors.push(`${field} không hợp lệ`);
      return '';
    }
    return value;
  };

  const station_code = code('station_code');
  const product_code = code('product_code');
  const source_id = code('source_id');

  const draw_date = typeof raw.draw_date === 'string' ? raw.draw_date : '';
  if (!isISODate(draw_date)) errors.push('draw_date phải là YYYY-MM-DD hợp lệ');

  const kind = raw.kind;
  if (kind !== 'live' && kind !== 'final') errors.push("kind phải là 'live' hoặc 'final'");

  const observed_at = typeof raw.observed_at === 'string' ? raw.observed_at : '';
  if (!ISO_UTC_RE.test(observed_at)) errors.push('observed_at phải là ISO-8601 UTC (…Z)');

  const source_updated_at = optionalIso(raw.source_updated_at, 'source_updated_at', errors);
  const period_code = optionalText(raw.period_code, 'period_code', errors, 20);
  const prize_rule_version = optionalRuleVersion(raw.prize_rule_version, errors);

  const prizes: Record<string, string[]> = {};
  const rawPrizes = raw.prizes;
  if (typeof rawPrizes !== 'object' || rawPrizes === null || Array.isArray(rawPrizes)) {
    errors.push('prizes phải là object { prize_code: [số…] }');
  } else {
    const entries = Object.entries(rawPrizes as Record<string, unknown>);
    if (entries.length === 0) errors.push('prizes phải có ít nhất một giải');
    if (entries.length > 15) errors.push('prizes có quá nhiều giải');
    for (const [prizeCode, numbers] of entries) {
      if (!PRIZE_CODE_RE.test(prizeCode)) {
        errors.push(`prizes.${prizeCode}: mã giải không hợp lệ`);
        continue;
      }
      if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > 15) {
        errors.push(`prizes.${prizeCode}: cần mảng 1..15 số`);
        continue;
      }
      const list: string[] = [];
      for (const number of numbers) {
        if (typeof number !== 'string' || !PRIZE_NUMBER_RE.test(number)) {
          errors.push(`prizes.${prizeCode}: số phải là chuỗi 2..6 chữ số (giữ số 0 ở đầu)`);
          list.length = 0;
          break;
        }
        list.push(number);
      }
      if (list.length > 0) prizes[prizeCode] = list;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      station_code,
      product_code,
      draw_date,
      kind: kind as ObservationKind,
      source_id,
      prizes,
      observed_at,
      source_updated_at,
      period_code,
      prize_rule_version,
    },
  };
}

/** JSON ổn định (khoá sắp xếp) để hash luôn như nhau. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Hash nội dung bộ số — hai nguồn trùng hash nghĩa là cùng một kết quả. */
export function contentHashOf(prizes: Record<string, string[]>): Promise<string> {
  return sha256Hex(canonicalJson(prizes));
}

/**
 * Hash payload để đối chiếu Idempotency-Key.
 * BỎ `observed_at` và `source_updated_at`: n8n tạo lại timestamp mỗi lần retry, nếu hash cả hai thì
 * retry cùng nội dung sẽ bị coi là payload khác và trả 409 thay vì 200 duplicate.
 */
export function requestHashOf(obs: Observation): Promise<string> {
  return sha256Hex(
    canonicalJson({
      station_code: obs.station_code,
      product_code: obs.product_code,
      draw_date: obs.draw_date,
      kind: obs.kind,
      source_id: obs.source_id,
      period_code: obs.period_code ?? null,
      prize_rule_version: obs.prize_rule_version ?? 1,
      prizes: obs.prizes,
    }),
  );
}

export interface RevisionRef {
  id: number;
  kind: ObservationKind;
  source_id: string;
  content_hash: string;
  observed_at: string;
}

export interface DrawState {
  status: DrawStatus;
  confirmed_revision_id: number | null;
  rev: number;
}

export type IngestAction =
  | 'unchanged'
  | 'live'
  | 'pending_confirmation'
  | 'confirm'
  | 'confirm_dual_source'
  | 'correction'
  | 'dispute'
  | 'ignore_downgrade';

interface IngestDecision {
  action: IngestAction;
  httpStatus: 200 | 201;
  /** Trạng thái mới của kỳ; null = giữ nguyên. */
  status: DrawStatus | null;
  /** Hash của bản được xác nhận (null = không đổi bản đã xác nhận). */
  confirmedHash: string | null;
  confirmedBy: string | null;
  isCorrection: boolean;
  reason: string;
}

export interface DecisionInput {
  observation: Observation;
  contentHash: string;
  sourceAuthoritative: boolean;
  current: DrawState | null;
  revisions: RevisionRef[];
}

function confirmedRevisionHash(current: DrawState | null, revisions: RevisionRef[]): string | null {
  if (!current?.confirmed_revision_id) return null;
  return revisions.find((r) => r.id === current.confirmed_revision_id)?.content_hash ?? null;
}

/** Luật A: quyết định công bố cho một observation. */
export function decideIngest(input: DecisionInput): IngestDecision {
  const { observation, contentHash, sourceAuthoritative, current, revisions } = input;

  const confirmedHash = confirmedRevisionHash(current, revisions);
  const hasConfirmed = Boolean(confirmedHash);
  const finalsFromOthers = revisions.filter(
    (r) => r.kind === 'final' && r.source_id !== observation.source_id,
  );

  if (observation.kind === 'live') {
    const locked =
      hasConfirmed ||
      current?.status === 'pending_confirmation' ||
      current?.status === 'disputed';
    if (locked) {
      return {
        action: 'ignore_downgrade',
        httpStatus: 200,
        status: null,
        confirmedHash: null,
        confirmedBy: null,
        isCorrection: false,
        reason: 'live đến sau bản final: không hạ trạng thái',
      };
    }
    return {
      action: 'live',
      httpStatus: 200,
      status: 'live',
      confirmedHash: null,
      confirmedBy: null,
      isCorrection: false,
      reason: 'số đang về',
    };
  }

  if (hasConfirmed && confirmedHash === contentHash) {
    return {
      action: 'unchanged',
      httpStatus: 200,
      status: null,
      confirmedHash: null,
      confirmedBy: null,
      isCorrection: false,
      reason: 'trùng bản đã xác nhận',
    };
  }

  if (hasConfirmed) {
    if (sourceAuthoritative) {
      return {
        action: 'correction',
        httpStatus: 201,
        status: 'confirmed',
        confirmedHash: contentHash,
        confirmedBy: 'auto:authoritative',
        isCorrection: true,
        reason: 'nguồn chính thức đính chính bản đã công bố',
      };
    }
    return {
      action: 'dispute',
      httpStatus: 201,
      status: 'disputed',
      confirmedHash: null,
      confirmedBy: null,
      isCorrection: false,
      reason: 'bản final khác hash từ nguồn thường: giữ bản cũ, đánh dấu disputed',
    };
  }

  if (sourceAuthoritative) {
    return {
      action: 'confirm',
      httpStatus: 201,
      status: 'confirmed',
      confirmedHash: contentHash,
      confirmedBy: 'auto:authoritative',
      isCorrection: false,
      reason: 'nguồn authoritative',
    };
  }

  if (finalsFromOthers.some((r) => r.content_hash === contentHash)) {
    return {
      action: 'confirm_dual_source',
      httpStatus: 201,
      status: 'confirmed',
      confirmedHash: contentHash,
      confirmedBy: 'auto:dual-source',
      isCorrection: false,
      reason: 'hai nguồn trùng content_hash',
    };
  }

  if (finalsFromOthers.some((r) => r.content_hash !== contentHash)) {
    return {
      action: 'dispute',
      httpStatus: 201,
      status: 'disputed',
      confirmedHash: null,
      confirmedBy: null,
      isCorrection: false,
      reason: 'hai bản final khác hash, chưa có nguồn authoritative',
    };
  }

  return {
    action: 'pending_confirmation',
    httpStatus: 201,
    status: 'pending_confirmation',
    confirmedHash: null,
    confirmedBy: null,
    isCorrection: false,
    reason: 'mới có một nguồn thường: hiện số nhưng chưa đối soát',
  };
}

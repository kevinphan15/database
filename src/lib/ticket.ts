/**
 * Dò vé trên kết quả ĐÃ XÁC NHẬN.
 * Quy tắc: vé có 6 chữ số; so khớp theo số chữ số của từng giải (lấy phần cuối của vé).
 * Không bao giờ dò trên kỳ chưa xác nhận hoặc thiếu dữ liệu.
 */

import { isComplete } from './format';
import type { Draw, PrizeRule } from './types';

export type TicketOutcome =
  | { kind: 'invalid'; message: string }
  | { kind: 'not-confirmed'; message: string }
  | { kind: 'incomplete'; message: string }
  | { kind: 'no-prize'; message: string }
  | { kind: 'prize'; message: string; hits: TicketHit[] };

export interface TicketHit {
  code: string;
  label: string;
  matched: string;
}

export const TICKET_LENGTH = 6;

/** Chuẩn hoá vé: bỏ khoảng trắng và dấu phân cách, giữ nguyên chữ số. */
export function normalizeTicket(raw: string): string {
  return raw.replace(/[\s.\-]/g, '');
}

export function validateTicket(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const value = normalizeTicket(raw);
  if (value.length === 0) {
    return { ok: false, message: 'Vui lòng nhập số vé.' };
  }
  if (!/^\d+$/.test(value)) {
    return { ok: false, message: 'Số vé chỉ được gồm chữ số (0–9), không có chữ cái hay ký tự khác.' };
  }
  if (value.length !== TICKET_LENGTH) {
    return { ok: false, message: `Số vé phải có đúng ${TICKET_LENGTH} chữ số.` };
  }
  return { ok: true, value };
}

/**
 * So vé với bảng giải.
 * Một giải trúng khi phần cuối của vé (đúng số chữ số của giải đó) trùng một số trúng của giải.
 */
export function checkTicket(
  ticket: string,
  draw: Draw | null,
  rules: PrizeRule[],
): TicketOutcome {
  const validated = validateTicket(ticket);
  if (!validated.ok) return { kind: 'invalid', message: validated.message };

  if (!draw) {
    return { kind: 'not-confirmed', message: 'Kỳ này chưa có kết quả trong hệ thống.' };
  }

  if (draw.status !== 'confirmed') {
    return {
      kind: 'not-confirmed',
      message: 'Kỳ này chưa được xác nhận nên chưa thể đối chiếu. Vui lòng quay lại sau.',
    };
  }

  if (!isComplete(draw.prizes, rules)) {
    return {
      kind: 'incomplete',
      message: 'Kỳ này thiếu dữ liệu giải nên chưa thể đối chiếu đầy đủ.',
    };
  }

  const value = validated.value;
  const hits: TicketHit[] = [];

  for (const rule of [...rules].sort((a, b) => a.ordinal - b.ordinal)) {
    const tail = value.slice(-rule.digits);
    const numbers = draw.prizes[rule.prize_code] ?? [];
    const matched = numbers.find((number) => number === tail);
    if (matched) hits.push({ code: rule.prize_code, label: rule.label, matched });
  }

  if (hits.length === 0) {
    return {
      kind: 'no-prize',
      message: 'Số vé này không trúng giải nào trong kỳ đã chọn.',
    };
  }

  return {
    kind: 'prize',
    message: `Số vé trúng ${hits.length} giải.`,
    hits,
  };
}

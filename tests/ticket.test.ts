import { describe, expect, it } from 'vitest';
import { checkTicket, normalizeTicket, validateTicket } from '../src/lib/ticket';
import type { Draw, PrizeRule } from '../src/lib/types';

const rules: PrizeRule[] = [
  { version: 1, prize_code: 'special', label: 'Giải Đặc Biệt', ordinal: 1, count: 1, digits: 6 },
  { version: 1, prize_code: 'first', label: 'Giải Nhất', ordinal: 2, count: 1, digits: 5 },
  { version: 1, prize_code: 'seventh', label: 'Giải Bảy', ordinal: 8, count: 1, digits: 3 },
  { version: 1, prize_code: 'eighth', label: 'Giải Tám', ordinal: 9, count: 1, digits: 2 },
];

const draw: Draw = {
  draw_key: 'DONG_NAI:xs-mn:2026-11-04',
  station_code: 'DONG_NAI',
  product_code: 'xs-mn',
  draw_date: '2026-11-04',
  status: 'confirmed',
  prize_rule_version: 1,
  updated_at: '2026-11-04T09:40:00Z',
  prizes: {
    special: ['012345'],
    first: ['12345'],
    seventh: ['345'],
    eighth: ['45'],
  },
};

describe('validateTicket', () => {
  it('chấp nhận 6 chữ số, giữ số 0 đầu', () => {
    expect(validateTicket('012345')).toEqual({ ok: true, value: '012345' });
  });

  it('bỏ khoảng trắng và dấu phân cách', () => {
    expect(normalizeTicket('012 345')).toBe('012345');
    expect(normalizeTicket('012.345')).toBe('012345');
    expect(normalizeTicket('012-345')).toBe('012345');
  });

  it('từ chối khi thiếu hoặc thừa chữ số', () => {
    const short = validateTicket('12345');
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.message).toMatch(/đúng 6 chữ số/);
    expect(validateTicket('0123456').ok).toBe(false);
  });

  it('từ chối ký tự không phải chữ số', () => {
    const bad = validateTicket('12a345');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/chữ số/);
  });

  it('từ chối chuỗi rỗng', () => {
    const empty = validateTicket('   ');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.message).toMatch(/nhập số vé/i);
  });
});

describe('checkTicket — chỉ dò trên kỳ đã xác nhận', () => {
  it('tìm được nhiều giải khi các số cuối trùng nhau', () => {
    const result = checkTicket('012345', draw, rules);
    expect(result.kind).toBe('prize');
    if (result.kind === 'prize') {
      expect(result.hits.map((h) => h.code)).toEqual(['special', 'first', 'seventh', 'eighth']);
      expect(result.hits[0]?.matched).toBe('012345');
    }
  });

  it('trả về không trúng khi không khớp giải nào', () => {
    const result = checkTicket('999999', draw, rules);
    expect(result.kind).toBe('no-prize');
  });

  it('từ chối kỳ chưa xác nhận', () => {
    const result = checkTicket('012345', { ...draw, status: 'pending_confirmation' }, rules);
    expect(result.kind).toBe('not-confirmed');
    if (result.kind === 'not-confirmed') expect(result.message).toMatch(/chưa được xác nhận/);
  });

  it('từ chối kỳ thiếu dữ liệu giải', () => {
    const incomplete: Draw = { ...draw, prizes: { special: ['012345'] } };
    const result = checkTicket('012345', incomplete, rules);
    expect(result.kind).toBe('incomplete');
  });

  it('trả về chưa có kết quả khi kỳ không tồn tại', () => {
    const result = checkTicket('012345', null, rules);
    expect(result.kind).toBe('not-confirmed');
  });

  it('ưu tiên lỗi định dạng trước khi kiểm tra kỳ', () => {
    const result = checkTicket('abc', draw, rules);
    expect(result.kind).toBe('invalid');
  });
});

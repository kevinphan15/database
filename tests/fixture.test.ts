import { describe, expect, it } from 'vitest';
import { fixtureDataset, validateDataset } from '../src/lib/fixture';
import {
  drawOnDate,
  isDrawDay,
  latestDraw,
  rulesFor,
  stationByPath,
  stationsDrawingOn,
} from '../src/lib/selectors';
import { isComplete } from '../src/lib/format';

describe('fixture Đồng Nai', () => {
  it('có 3 trạng thái cần kiểm thử: đã xác nhận, chưa đối soát, ngày không quay', () => {
    expect(drawOnDate(fixtureDataset, 'DONG_NAI', '2026-11-04')?.status).toBe('confirmed');
    expect(drawOnDate(fixtureDataset, 'DONG_NAI', '2026-11-11')?.status).toBe('pending_confirmation');
    expect(drawOnDate(fixtureDataset, 'DONG_NAI', '2026-11-12')).toBeNull();
  });

  it('giữ số 0 ở đầu cho mọi giải', () => {
    const draw = drawOnDate(fixtureDataset, 'DONG_NAI', '2026-11-04');
    expect(draw?.prizes.eighth?.[0]).toBe('09');
    expect(draw?.prizes.seventh?.[0]).toBe('007');
    expect(draw?.prizes.fifth?.[0]).toBe('0123');
    expect(draw?.prizes.special?.[0]).toBe('001234');
  });

  it('kỳ 04/11 đủ cơ cấu, kỳ 11/11 thiếu giải', () => {
    const rules = rulesFor(fixtureDataset, 1);
    const four = drawOnDate(fixtureDataset, 'DONG_NAI', '2026-11-04');
    const eleven = drawOnDate(fixtureDataset, 'DONG_NAI', '2026-11-11');
    expect(isComplete(four?.prizes ?? {}, rules)).toBe(true);
    expect(isComplete(eleven?.prizes ?? {}, rules)).toBe(false);
  });

  it('kỳ gần nhất là 11/11 và đang chờ đối soát', () => {
    expect(latestDraw(fixtureDataset, 'DONG_NAI')?.draw_date).toBe('2026-11-11');
    expect(latestDraw(fixtureDataset, 'DONG_NAI')?.status).toBe('pending_confirmation');
  });

  it('lịch: quay thứ Tư, không quay thứ Năm', () => {
    expect(isDrawDay(fixtureDataset, 'DONG_NAI', '2026-11-11')).toBe(true);
    expect(isDrawDay(fixtureDataset, 'DONG_NAI', '2026-11-12')).toBe(false);
  });

  it('tra theo đường dẫn miền/đài', () => {
    const found = stationByPath(fixtureDataset, 'mien-nam', 'dong-nai');
    expect(found?.station.station_code).toBe('DONG_NAI');
    expect(stationByPath(fixtureDataset, 'mien-nam', 'khong-co')).toBeNull();
  });

  it('danh sách đài quay trong ngày', () => {
    expect(stationsDrawingOn(fixtureDataset, '2026-11-11')).toHaveLength(1);
    expect(stationsDrawingOn(fixtureDataset, '2026-11-12')).toHaveLength(0);
  });
});

describe('validateDataset — chốt chặn dữ liệu hỏng', () => {
  const base = {
    notice: 'test',
    is_fixture: true,
    product_code: 'xs-mn',
    prize_rule_version: 1,
    regions: [{ code: 'MN', name: 'Miền Nam', slug: 'mien-nam' }],
    stations: [
      {
        station_code: 'DONG_NAI',
        region_code: 'MN',
        slug: 'dong-nai',
        name: 'Đồng Nai',
        redistribution_allowed: 0,
      },
    ],
    prize_rules: [{ version: 1, prize_code: 'eighth', label: 'Giải Tám', ordinal: 9, count: 1, digits: 2 }],
    schedule: [],
    exceptions: [],
    draws: [
      {
        draw_key: 'DONG_NAI:xs-mn:2026-11-04',
        station_code: 'DONG_NAI',
        product_code: 'xs-mn',
        draw_date: '2026-11-04',
        status: 'confirmed',
        prize_rule_version: 1,
        updated_at: '2026-11-04T09:40:00Z',
        prizes: { eighth: ['09'] },
      },
    ],
  };

  it('chấp nhận dữ liệu đúng', () => {
    expect(() => validateDataset(base)).not.toThrow();
  });

  it('từ chối khi số trúng bị đổi thành kiểu số', () => {
    const broken = structuredClone(base) as Record<string, unknown>;
    (broken.draws as { prizes: Record<string, unknown> }[])[0]!.prizes = { eighth: [9] };
    expect(() => validateDataset(broken)).toThrow(/chuỗi chữ số/);
  });

  it('từ chối ngày sai định dạng', () => {
    const broken = structuredClone(base) as Record<string, unknown>;
    (broken.draws as { draw_date: string }[])[0]!.draw_date = '04/11/2026';
    expect(() => validateDataset(broken)).toThrow(/YYYY-MM-DD/);
  });

  it('từ chối trạng thái không hợp lệ', () => {
    const broken = structuredClone(base) as Record<string, unknown>;
    (broken.draws as { status: string }[])[0]!.status = 'done';
    expect(() => validateDataset(broken)).toThrow(/status/);
  });
});

import { describe, expect, it } from 'vitest';
import { buildHealthReport, type HealthRow } from '../src/lib/health';

function row(over: Partial<HealthRow> = {}): HealthRow {
  return {
    station_code: 'DONG_NAI',
    name: 'Đồng Nai',
    last_confirmed_date: '2026-11-04',
    last_draw_date: '2026-11-04',
    pending: 0,
    disputed: 0,
    ...over,
  };
}

const options = {
  publishEnabled: true,
  indexEnabled: true,
  today: '2026-11-13',
  checkedAt: '2026-11-13T03:00:00Z',
};

describe('buildHealthReport', () => {
  it('lag_days = 0 khi kỳ đã xác nhận có ngày ở tương lai', () => {
    const report = buildHealthReport(
      [row({ last_confirmed_date: '2026-11-18', last_draw_date: '2026-12-02' })],
      options,
    );

    expect(report.stations[0]?.lag_days).toBe(0);
    expect(report.stale).toHaveLength(0);
  });

  it('tính lag bình thường và đánh dấu stale khi quá 2 ngày', () => {
    const report = buildHealthReport([row()], options);
    expect(report.stations[0]?.lag_days).toBe(9);
    expect(report.stale).toHaveLength(1);
  });

  it('lag 0 và 2 ngày vẫn được coi là tươi', () => {
    const report = buildHealthReport(
      [row({ last_confirmed_date: '2026-11-13' }), row({ last_confirmed_date: '2026-11-11' })],
      options,
    );
    expect(report.stations.map((station) => station.lag_days)).toEqual([0, 2]);
    expect(report.stale).toHaveLength(0);
  });

  it('chưa có bản xác nhận: lag_days null và nằm trong stale', () => {
    const report = buildHealthReport([row({ last_confirmed_date: null })], options);
    expect(report.stations[0]?.lag_days).toBeNull();
    expect(report.stale[0]?.station_code).toBe('DONG_NAI');
  });

  it('giữ nguyên trạng thái xuất bản và số kỳ pending/disputed', () => {
    const report = buildHealthReport([row({ pending: 3, disputed: 1 })], {
      ...options,
      publishEnabled: false,
    });
    expect(report.publish_enabled).toBe(false);
    expect(report.stations[0]).toMatchObject({ pending: 3, disputed: 1 });
    expect(report).toMatchObject({ ok: true, today: '2026-11-13', checked_at: options.checkedAt });
  });

  it('báo chế độ tối qua index_enabled, độc lập với publish_enabled', () => {
    const dark = buildHealthReport([row()], { ...options, indexEnabled: false });
    expect(dark).toMatchObject({ publish_enabled: true, index_enabled: false });

    const normal = buildHealthReport([row()], options);
    expect(normal.index_enabled).toBe(true);
  });
});

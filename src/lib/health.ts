/** Tổng hợp báo cáo cho `/internal/v1/health` (thuần logic, test được). */

export interface HealthRow {
  station_code: string;
  name: string;
  last_confirmed_date: string | null;
  last_draw_date: string | null;
  pending: number;
  disputed: number;
}

interface HealthOptions {
  publishEnabled: boolean;
  /** Công tắc index toàn cục: false = site đang ở chế độ tối (noindex). */
  indexEnabled: boolean;
  /** Hôm nay theo giờ VN, YYYY-MM-DD. */
  today: string;
  checkedAt: string;
}

/** Số ngày từ `from` đến `to` (âm nếu `from` ở tương lai). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function buildHealthReport(rows: HealthRow[], options: HealthOptions) {
  const stations = rows.map((row) => ({
    station_code: row.station_code,
    name: row.name,
    last_confirmed_date: row.last_confirmed_date ?? null,
    last_draw_date: row.last_draw_date ?? null,
    // Kỳ có ngày ở tương lai (dữ liệu ghi trước/ sai) không được tạo lag âm.
    lag_days: row.last_confirmed_date
      ? Math.max(0, daysBetween(row.last_confirmed_date, options.today))
      : null,
    pending: row.pending ?? 0,
    disputed: row.disputed ?? 0,
  }));

  return {
    ok: true,
    publish_enabled: options.publishEnabled,
    index_enabled: options.indexEnabled,
    today: options.today,
    checked_at: options.checkedAt,
    stale: stations.filter((row) => row.lag_days === null || row.lag_days > 2),
    stations,
  };
}

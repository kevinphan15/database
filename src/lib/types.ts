/** Kiểu dữ liệu dùng chung giữa fixture và D1. */

export type DrawStatus = 'scheduled' | 'live' | 'pending_confirmation' | 'confirmed' | 'disputed';

export interface Region {
  code: string;
  name: string;
  slug: string;
}

export interface Station {
  station_code: string;
  region_code: string;
  slug: string;
  name: string;
  short_name?: string | null;
  status: string;
  redistribution_allowed: number;
}

export interface PrizeRule {
  version: number;
  prize_code: string;
  label: string;
  ordinal: number;
  count: number;
  digits: number;
}

export interface ScheduleRule {
  station_code: string;
  product_code: string;
  iso_weekday: number;
  local_time: string;
  from_date: string;
  to_date?: string | null;
}

export interface ScheduleException {
  station_code: string;
  product_code: string;
  exception_date: string;
  action: 'skip' | 'move';
  new_date?: string | null;
  new_time?: string | null;
}

export interface Draw {
  draw_key: string;
  station_code: string;
  product_code: string;
  draw_date: string;
  period_code?: string | null;
  status: DrawStatus;
  prize_rule_version: number;
  updated_at: string;
  is_correction?: boolean;
  /** prize_code -> mảng chuỗi số (giữ nguyên số 0 ở đầu) */
  prizes: Record<string, string[]>;
}

export interface Dataset {
  notice: string;
  is_fixture: boolean;
  product_code: string;
  prize_rule_version: number;
  regions: Region[];
  stations: Station[];
  prize_rules: PrizeRule[];
  schedule: ScheduleRule[];
  exceptions: ScheduleException[];
  draws: Draw[];
}

export type DataSource = 'd1' | 'fixture';

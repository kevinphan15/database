/** Kiểm tra lô lịch quay: sai một dòng là từ chối cả lô (all-or-nothing). */

export interface ScheduleRuleInput {
  station_code: string;
  product_code: string;
  iso_weekday: number;
  local_time: string;
  from_date: string;
  to_date?: string | null;
  source_id?: string | null;
}

export interface ScheduleExceptionInput {
  station_code: string;
  product_code: string;
  exception_date: string;
  action: 'skip' | 'move';
  new_date?: string | null;
  new_time?: string | null;
  source_id?: string | null;
}

export interface ScheduleSyncPayload {
  rules: ScheduleRuleInput[];
  exceptions: ScheduleExceptionInput[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRealDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
  );
}

function optionalDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return isRealDate(value) ? value : undefined;
}

export type ParsedScheduleSync =
  | { ok: true; value: ScheduleSyncPayload }
  | { ok: false; errors: string[] };

export function parseScheduleSync(input: unknown): ParsedScheduleSync {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['payload phải là object JSON'] };
  }
  const raw = input as Record<string, unknown>;
  const rawRules = raw.rules ?? [];
  const rawExceptions = raw.exceptions ?? [];

  if (!Array.isArray(rawRules)) errors.push('rules phải là mảng');
  if (!Array.isArray(rawExceptions)) errors.push('exceptions phải là mảng');
  if (errors.length > 0) return { ok: false, errors };

  if (rawRules.length === 0 && rawExceptions.length === 0) {
    return { ok: false, errors: ['payload rỗng: cần ít nhất một rule hoặc exception'] };
  }
  if (rawRules.length + rawExceptions.length > 500) {
    return { ok: false, errors: ['lô quá lớn (tối đa 500 dòng)'] };
  }

  const rules: ScheduleRuleInput[] = [];
  (rawRules as unknown[]).forEach((item, index) => {
    const row = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const station = typeof row.station_code === 'string' ? row.station_code : '';
    const product = typeof row.product_code === 'string' ? row.product_code : '';
    const weekday = row.iso_weekday;
    const time = row.local_time;
    const toDate = optionalDate(row.to_date);

    if (!station) errors.push(`rules[${index}].station_code thiếu hoặc sai`);
    if (!product) errors.push(`rules[${index}].product_code thiếu hoặc sai`);
    if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      errors.push(`rules[${index}].iso_weekday phải là 1..7`);
    }
    if (typeof time !== 'string' || !TIME_RE.test(time)) {
      errors.push(`rules[${index}].local_time phải là HH:MM (24h)`);
    }
    if (!isRealDate(row.from_date)) errors.push(`rules[${index}].from_date phải là YYYY-MM-DD hợp lệ`);
    if (toDate === undefined) errors.push(`rules[${index}].to_date phải là YYYY-MM-DD hoặc null`);

    rules.push({
      station_code: station,
      product_code: product,
      iso_weekday: weekday as number,
      local_time: time as string,
      from_date: row.from_date as string,
      to_date: toDate ?? null,
      source_id: typeof row.source_id === 'string' ? row.source_id : null,
    });
  });

  const exceptions: ScheduleExceptionInput[] = [];
  (rawExceptions as unknown[]).forEach((item, index) => {
    const row = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const station = typeof row.station_code === 'string' ? row.station_code : '';
    const product = typeof row.product_code === 'string' ? row.product_code : '';
    const action = row.action;
    const newDate = optionalDate(row.new_date);
    const newTime =
      row.new_time === undefined || row.new_time === null
        ? null
        : typeof row.new_time === 'string' && TIME_RE.test(row.new_time)
          ? row.new_time
          : undefined;

    if (!station) errors.push(`exceptions[${index}].station_code thiếu hoặc sai`);
    if (!product) errors.push(`exceptions[${index}].product_code thiếu hoặc sai`);
    if (!isRealDate(row.exception_date)) {
      errors.push(`exceptions[${index}].exception_date phải là YYYY-MM-DD hợp lệ`);
    }
    if (action !== 'skip' && action !== 'move') errors.push(`exceptions[${index}].action phải là skip|move`);
    if (newDate === undefined) errors.push(`exceptions[${index}].new_date phải là YYYY-MM-DD hoặc null`);
    if (newTime === undefined) errors.push(`exceptions[${index}].new_time phải là HH:MM hoặc null`);
    if (action === 'move' && !newDate) errors.push(`exceptions[${index}]: action=move cần new_date`);

    exceptions.push({
      station_code: station,
      product_code: product,
      exception_date: row.exception_date as string,
      action: action as 'skip' | 'move',
      new_date: newDate ?? null,
      new_time: newTime ?? null,
      source_id: typeof row.source_id === 'string' ? row.source_id : null,
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { rules, exceptions } };
}

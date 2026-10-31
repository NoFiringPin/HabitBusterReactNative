export type ReportPeriod = 'week' | 'month';
export interface DayLog { total: number; hours: number[] }
export interface ReportDay {
  key: string;
  date: Date;
  total: number;
  recorded: boolean;
  future: boolean;
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Calendar periods use local dates, including through daylight-saving changes. */
export function buildShieldReport(log: ReadonlyMap<string, DayLog>, period: ReportPeriod, offset = 0, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') start.setDate(start.getDate() - (start.getDay() + 6) % 7 + offset * 7);
  else start.setFullYear(now.getFullYear(), now.getMonth() + offset, 1);
  const length = period === 'week' ? 7 : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const today = dayKey(now);
  const days: ReportDay[] = Array.from({ length }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const key = dayKey(date);
    const future = key > today;
    return { key, date, total: future ? 0 : log.get(key)?.total ?? 0, recorded: !future && log.has(key), future };
  });
  const recorded = days.filter((day) => day.recorded);
  const total = recorded.reduce((sum, day) => sum + day.total, 0);
  return {
    start, end: days[days.length - 1].date, days, total,
    recordedDays: recorded.length,
    average: recorded.length ? total / recorded.length : null,
    touchFreeDays: recorded.filter((day) => day.total === 0).length,
  };
}

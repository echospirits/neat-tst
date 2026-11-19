import { EASTERN_TIME_ZONE, formatDateInputValue } from './dateTime';

export const MAX_OHLQ_LOAD_DATES = 30;

/** Freeze the requested batch before retries so crossing midnight cannot move it. */
export function normalizeOhlqLoadDates(dates: string[]): string[] {
  if (dates.length < 1 || dates.length > MAX_OHLQ_LOAD_DATES) {
    throw new Error(`Provide between 1 and ${MAX_OHLQ_LOAD_DATES} report dates.`);
  }
  for (const value of dates) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new Error('Report dates must be real YYYY-MM-DD dates.');
    }
  }
  if (new Set(dates).size !== dates.length) throw new Error('Report dates must be unique.');
  return [...dates].sort();
}

export function parseOhlqLoadDates(value: string): string[] {
  return normalizeOhlqLoadDates(value.split(','));
}

export function resolveOhlqBackfillDates(
  { date, dates, days }: { date?: string | null; dates?: string | null; days?: string | null },
  now = new Date(),
): string[] {
  if ([date, dates, days].filter((value) => value != null).length > 1) {
    throw new Error('Choose only one of --date, --dates, or --days.');
  }
  if (date != null) return normalizeOhlqLoadDates([date]);
  if (dates != null) return parseOhlqLoadDates(dates);

  const rawDays = days ?? '7';
  const count = Number(rawDays);
  if (!/^[1-9]\d*$/.test(rawDays) || !Number.isInteger(count) || count > MAX_OHLQ_LOAD_DATES) {
    throw new Error(`--days must be between 1 and ${MAX_OHLQ_LOAD_DATES}.`);
  }
  const today = new Date(`${formatDateInputValue(now, EASTERN_TIME_ZONE)}T12:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (count - index));
    return date.toISOString().slice(0, 10);
  });
}

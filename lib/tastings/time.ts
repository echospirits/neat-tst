export const TASTING_TIMEZONE = 'America/New_York';
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TASTING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: TASTING_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function tastingDateKey(value: Date): string {
  const parts = dateFormatter.formatToParts(value);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

export function tastingTimeValue(value: Date): string { return timeFormatter.format(value); }

export function tastingBusinessDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use a valid tasting date.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Use a valid tasting date.');
  return date;
}

/** Reject non-existent and ambiguous DST wall times rather than silently moving an appointment. */
export function tastingLocalTimestamp(date: string, time: string): Date {
  tastingBusinessDate(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Use a valid tasting time.');
  const wall = Date.parse(`${date}T${time}:00.000Z`);
  const matches = [4, 5].map(offset => new Date(wall + offset * 3_600_000))
    .filter(candidate => tastingDateKey(candidate) === date && tastingTimeValue(candidate) === time);
  if (matches.length !== 1) throw new Error('This time is ambiguous or unavailable because of daylight saving time. Choose another time.');
  return matches[0];
}

export function parseTastingSchedule(date: string, startTime: string, endTime: string) {
  const startsAt = tastingLocalTimestamp(date, startTime);
  const endsAt = tastingLocalTimestamp(date, endTime);
  if (endsAt <= startsAt) throw new Error('End time must follow start time on the tasting date.');
  return { scheduledDate: tastingBusinessDate(date), startsAt, endsAt };
}

export function tastingScheduleLabel(value: { startsAt: Date; endsAt: Date }) {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: TASTING_TIMEZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(value.startsAt);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: TASTING_TIMEZONE, hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time.format(value.startsAt)}–${time.format(value.endsAt)} Eastern`;
}

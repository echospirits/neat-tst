import { addDaysToDateInputValue, formatEasternDateInputValue } from './dateTime';

export type SchedulerWorklistItem = {
  id: string;
  dueDate: string | null;
  dueTimeMinutes: number | null;
  status: string;
};

export type SchedulerDayItems<T extends SchedulerWorklistItem> = {
  timed: T[];
  anytime: T[];
};

export function isValidSchedulerDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getCurrentSchedulerDate(now = new Date()) {
  return formatEasternDateInputValue(now);
}

export function addSchedulerDays(date: string, days: number) {
  return addDaysToDateInputValue(date, days);
}

export function getSchedulerWeekDates(anchorDate: string) {
  const date = new Date(`${anchorDate}T00:00:00.000Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const monday = addSchedulerDays(anchorDate, -daysSinceMonday);
  return Array.from({ length: 7 }, (_, index) => addSchedulerDays(monday, index));
}

export function getSchedulerWeekStart(anchorDate: string) {
  return getSchedulerWeekDates(anchorDate)[0];
}

export function getSchedulerDayItems<T extends SchedulerWorklistItem>(
  items: T[],
  date: string,
): SchedulerDayItems<T> {
  const activeItems = items.filter((item) => item.status === 'OPEN' || item.status === 'IN_PROGRESS');
  return {
    timed: activeItems
      .filter((item) => item.dueDate === date && item.dueTimeMinutes !== null)
      .sort((left, right) => left.dueTimeMinutes! - right.dueTimeMinutes! || left.id.localeCompare(right.id)),
    anytime: activeItems
      .filter((item) => item.dueDate === date && item.dueTimeMinutes === null)
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function getSchedulerPlanningTray<T extends SchedulerWorklistItem>(items: T[], weekStart: string) {
  return items
    .filter((item) =>
      (item.status === 'OPEN' || item.status === 'IN_PROGRESS') &&
      (item.dueDate === null || item.dueDate < weekStart),
    )
    .sort((left, right) => {
      if (left.dueDate === null) return right.dueDate === null ? left.id.localeCompare(right.id) : 1;
      if (right.dueDate === null) return -1;
      return left.dueDate.localeCompare(right.dueDate) || left.id.localeCompare(right.id);
    });
}

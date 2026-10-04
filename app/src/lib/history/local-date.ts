/** A day counted from 1970-01-01 on a local calendar, the way the core counts one. */
export type LocalDay = number;

const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const MONDAY = 1;
const WEEKDAY_OF_DAY_ZERO = 4;

/** The device's day at a moment. */
export function localDayOf(at: Date): LocalDay {
  return Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) / MS_PER_DAY;
}

/** The weekday of a day, 1 being Monday and 7 Sunday. */
function weekdayOf(day: LocalDay): number {
  const fromMonday = day + WEEKDAY_OF_DAY_ZERO - MONDAY;
  return (
    (((fromMonday % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK) + MONDAY
  );
}

/** The first day of the week holding `day`, for weeks that start on `firstDay`, 1 being Monday and 7 Sunday. */
export function weekStartOf(day: LocalDay, firstDay: number): LocalDay {
  return day - ((weekdayOf(day) - firstDay + DAYS_PER_WEEK) % DAYS_PER_WEEK);
}

interface WeekInfo {
  readonly firstDay: number;
}

/** A locale's week, read through `getWeekInfo` or the `weekInfo` getter older WebKit offers instead. */
export interface LocaleWeek {
  readonly getWeekInfo?: () => WeekInfo;
  readonly weekInfo?: WeekInfo;
}

/** The day `locale` starts its weeks on, 1 being Monday and 7 Sunday, or Monday where the browser can't tell. */
export function firstDayOfWeek(locale: LocaleWeek): number {
  return locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay ?? MONDAY;
}

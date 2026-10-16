import type { HistoryCalendar } from "#lib/history/history-groups.ts";
import { type LocalDay, noonUtcOf } from "#lib/history/local-date.ts";
import { m } from "#lib/paraglide/messages.js";

export interface DayFormats {
  readonly weekday: Intl.DateTimeFormat;
  readonly date: Intl.DateTimeFormat;
  readonly dateWithYear: Intl.DateTimeFormat;
}

export function dayFormats(locale: string): DayFormats {
  const date: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  };
  return {
    weekday: new Intl.DateTimeFormat(locale, {
      weekday: "long",
      timeZone: "UTC",
    }),
    date: new Intl.DateTimeFormat(locale, date),
    dateWithYear: new Intl.DateTimeFormat(locale, { ...date, year: "numeric" }),
  };
}

export function dayName(
  day: LocalDay,
  { today, weekStart }: HistoryCalendar,
  formats: DayFormats,
): string {
  const daysAgo = today - day;
  if (daysAgo === 0) {
    return m.history_today();
  }
  if (daysAgo === 1) {
    return m.history_yesterday();
  }
  const noon = noonUtcOf(day);
  if (daysAgo > 1 && day >= weekStart) {
    return formats.weekday.format(noon);
  }
  const isThisYear =
    noon.getUTCFullYear() === noonUtcOf(today).getUTCFullYear();
  return (isThisYear ? formats.date : formats.dateWithYear).format(noon);
}

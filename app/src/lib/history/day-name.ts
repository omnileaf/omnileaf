import type { HistoryCalendar } from "#lib/history/history-days.ts";
import type { LocalDay } from "#lib/history/local-date.ts";
import { m } from "#lib/paraglide/messages.js";

const MS_PER_DAY = 86_400_000;
const NOON_MS = MS_PER_DAY / 2;

/** Noon UTC of a day, which every zone's formatter puts on the same day once told the zone is UTC. */
function noonUtcOf(day: LocalDay): Date {
  return new Date(day * MS_PER_DAY + NOON_MS);
}

/** What History calls a day: today, yesterday, a weekday within this week, or else its date. */
export function dayName(
  day: LocalDay,
  { today, weekStart }: HistoryCalendar,
  locale: string,
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
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      timeZone: "UTC",
    }).format(noon);
  }
  const isThisYear =
    noon.getUTCFullYear() === noonUtcOf(today).getUTCFullYear();
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(isThisYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(noon);
}

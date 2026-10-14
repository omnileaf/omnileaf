import type { LocalDay } from "#lib/history/local-date.ts";
import type { HistoryEntry } from "#lib/ipc/bindings.ts";

/** The days History names: today, and the first day of the week holding it. */
export interface HistoryCalendar {
  readonly today: LocalDay;
  readonly weekStart: LocalDay;
}

/** A day of its own, or the days of the week before this one gathered together. */
export type HistoryDayTitle =
  | { readonly kind: "day"; readonly day: LocalDay }
  | { readonly kind: "lastWeek" };

/** The sessions started on one local day, or on the days of last week, and how long was read on them. */
export interface HistoryDay {
  readonly title: HistoryDayTitle;
  readonly readSeconds: number;
  readonly entries: readonly HistoryEntry[];
}

/** The first and last of the days History gathers under last week. */
export interface DayRange {
  readonly first: LocalDay;
  readonly last: LocalDay;
}

const DAYS_PER_WEEK = 7;

/** The seven days before this week, but for yesterday, which keeps a name of its own. */
export function lastWeekDays({ today, weekStart }: HistoryCalendar): DayRange {
  return {
    first: weekStart - DAYS_PER_WEEK,
    last: Math.min(weekStart - 1, today - 2),
  };
}

function titleOf(day: LocalDay, calendar: HistoryCalendar): HistoryDayTitle {
  const { first, last } = lastWeekDays(calendar);
  return day >= first && day <= last
    ? { kind: "lastWeek" }
    : { kind: "day", day };
}

/** Names a heading apart from every other heading History shows. */
export function historyDayKey(title: HistoryDayTitle): string {
  return title.kind === "lastWeek" ? title.kind : String(title.day);
}

interface Gathering {
  readonly title: HistoryDayTitle;
  readSeconds: number;
  readonly entries: HistoryEntry[];
  readonly daysCounted: Set<LocalDay>;
}

/** Gathers sessions listed newest first under the heading of their day, or of last week, in the order each heading is first listed, and last week read for `lastWeekReadSeconds` once known. */
export function historyDays(
  entries: readonly HistoryEntry[],
  calendar: HistoryCalendar,
  lastWeekReadSeconds?: number,
): HistoryDay[] {
  const gathered = new Map<string, Gathering>();
  for (const entry of entries) {
    const title = titleOf(entry.day.day, calendar);
    const key = historyDayKey(title);
    const current = gathered.get(key);
    if (current === undefined) {
      gathered.set(key, {
        title,
        readSeconds: entry.day.readSeconds,
        entries: [entry],
        daysCounted: new Set([entry.day.day]),
      });
      continue;
    }
    current.entries.push(entry);
    if (!current.daysCounted.has(entry.day.day)) {
      current.daysCounted.add(entry.day.day);
      current.readSeconds += entry.day.readSeconds;
    }
  }
  const days = [...gathered.values()];
  return days.map(({ title, readSeconds, entries: listed }) => ({
    title,
    readSeconds:
      title.kind === "lastWeek" && lastWeekReadSeconds !== undefined
        ? lastWeekReadSeconds
        : readSeconds,
    entries: listed,
  }));
}

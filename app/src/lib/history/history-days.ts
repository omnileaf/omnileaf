import type { LocalDay } from "#lib/history/local-date.ts";
import type { HistoryEntry } from "#lib/ipc/bindings.ts";

export interface HistoryCalendar {
  readonly today: LocalDay;
  readonly weekStart: LocalDay;
}

export type HistoryDayTitle =
  | { readonly kind: "day"; readonly day: LocalDay }
  | { readonly kind: "lastWeek" };

export interface HistoryDay {
  readonly title: HistoryDayTitle;
  readonly readSeconds: number;
  readonly entries: readonly HistoryEntry[];
}

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

export function historyDayKey(title: HistoryDayTitle): string {
  return title.kind === "lastWeek" ? title.kind : String(title.day);
}

interface Gathering {
  readonly title: HistoryDayTitle;
  readSeconds: number;
  readonly entries: HistoryEntry[];
  readonly daysCounted: Set<LocalDay>;
}

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

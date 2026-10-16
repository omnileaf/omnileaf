import type { HistoryEntry } from "#lib/ipc/bindings.ts";

import type { LocalDay } from "./local-date.ts";

export const HISTORY_GROUPS = [
  "today",
  "yesterday",
  "thisWeek",
  "earlier",
] as const;

export type HistoryGroupName = (typeof HISTORY_GROUPS)[number];

export interface HistoryCalendar {
  readonly today: LocalDay;
  readonly weekStart: LocalDay;
}

export interface HistoryGroup {
  readonly name: HistoryGroupName;
  readonly entries: readonly HistoryEntry[];
}

export function groupOf(
  day: LocalDay,
  { today, weekStart }: HistoryCalendar,
): HistoryGroupName {
  const daysAgo = today - day;
  if (daysAgo <= 0) {
    return "today";
  }
  if (daysAgo === 1) {
    return "yesterday";
  }
  return day >= weekStart ? "thisWeek" : "earlier";
}

export function historyGroups(
  entries: readonly HistoryEntry[],
  calendar: HistoryCalendar,
): readonly HistoryGroup[] {
  return HISTORY_GROUPS.map((name) => ({
    name,
    entries: entries.filter(
      (entry) => groupOf(entry.day.day, calendar) === name,
    ),
  })).filter(({ entries: grouped }) => grouped.length > 0);
}

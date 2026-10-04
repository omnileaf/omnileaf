import type { LocalDay } from "#lib/history/local-date.ts";
import type { HistoryEntry } from "#lib/ipc/bindings.ts";

/** The sessions started on one local day, and how long was read on it. */
export interface HistoryDay {
  readonly day: LocalDay;
  readonly readSeconds: number;
  readonly entries: readonly HistoryEntry[];
}

/** Gathers sessions listed newest first into their days, keeping their order. */
export function historyDays(entries: readonly HistoryEntry[]): HistoryDay[] {
  const days: {
    day: LocalDay;
    readSeconds: number;
    entries: HistoryEntry[];
  }[] = [];
  for (const entry of entries) {
    const current = days.at(-1);
    if (current?.day === entry.day.day) {
      current.entries.push(entry);
    } else {
      days.push({
        day: entry.day.day,
        readSeconds: entry.day.readSeconds,
        entries: [entry],
      });
    }
  }
  return days;
}

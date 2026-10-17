import type { HistoryEntry } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

import type { HistoryGroupName } from "./history-groups.ts";
import { onThatClock, startedAtFormats } from "./started-at.ts";

export interface WhenFormats {
  readonly time: Intl.DateTimeFormat;
  readonly weekday: Intl.DateTimeFormat;
  readonly date: Intl.DateTimeFormat;
}

export function whenFormats(
  locale: string,
  hourCycle?: Intl.LocaleHourCycleKey,
): WhenFormats {
  return {
    time: startedAtFormats(locale, hourCycle).time,
    weekday: new Intl.DateTimeFormat(locale, {
      weekday: "long",
      timeZone: "UTC",
    }),
    date: new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}

export function whereLeft(entry: Pick<HistoryEntry, "readTo">): string {
  return entry.readTo.state === "end"
    ? m.history_entry_finished()
    : m.history_entry_page({
        page: entry.readTo.page,
        count: entry.readTo.pageCount,
      });
}

const WHEN_BY_GROUP = {
  today: "time",
  yesterday: "time",
  thisWeek: "weekday",
  earlier: "date",
} as const satisfies Record<HistoryGroupName, keyof WhenFormats>;

export function historyLine(
  entry: Pick<
    HistoryEntry,
    "bookTitle" | "readTo" | "startedAtMs" | "utcOffsetMinutes"
  >,
  group: HistoryGroupName,
  formats: WhenFormats,
): string {
  return m.history_entry_line({
    book: entry.bookTitle,
    where: whereLeft(entry),
    when: formats[WHEN_BY_GROUP[group]].format(onThatClock(entry)),
  });
}

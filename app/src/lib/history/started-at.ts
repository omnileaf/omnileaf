import type { HistoryEntry } from "#lib/ipc/bindings.ts";

const MS_PER_MINUTE = 60_000;

/** The time a session started at on the device's clock as it was then, wherever the device is now. */
export function startedAtTime(
  entry: Pick<HistoryEntry, "startedAtMs" | "utcOffsetMinutes">,
  locale: string,
): string {
  const onThatClock =
    entry.startedAtMs + entry.utcOffsetMinutes * MS_PER_MINUTE;
  return new Intl.DateTimeFormat(locale, {
    timeStyle: "short",
    timeZone: "UTC",
  }).format(onThatClock);
}

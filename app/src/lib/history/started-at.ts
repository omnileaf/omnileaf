import type { HistoryEntry } from "#lib/ipc/bindings.ts";

const MS_PER_MINUTE = 60_000;

type StartedAt = Pick<HistoryEntry, "startedAtMs" | "utcOffsetMinutes">;

/** The moment on the device's clock as it was then, read as UTC so it shows the same wherever the device is now. */
function onThatClock(entry: StartedAt): number {
  return entry.startedAtMs + entry.utcOffsetMinutes * MS_PER_MINUTE;
}

/** The time a session started at on the device's clock as it was then, wherever the device is now. */
export function startedAtTime(entry: StartedAt, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeStyle: "short",
    timeZone: "UTC",
  }).format(onThatClock(entry));
}

/** The weekday and time a session started at on the device's clock as it was then. */
export function startedAtWeekdayTime(entry: StartedAt, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(onThatClock(entry));
}

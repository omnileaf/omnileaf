import type { HistoryEntry } from "#lib/ipc/bindings.ts";

const MS_PER_MINUTE = 60_000;

type StartedAt = Pick<HistoryEntry, "startedAtMs" | "utcOffsetMinutes">;

export interface StartedAtFormats {
  readonly time: Intl.DateTimeFormat;
  readonly weekdayTime: Intl.DateTimeFormat;
}

export function startedAtFormats(locale: string): StartedAtFormats {
  return {
    time: new Intl.DateTimeFormat(locale, {
      timeStyle: "short",
      timeZone: "UTC",
    }),
    weekdayTime: new Intl.DateTimeFormat(locale, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }),
  };
}

/** The moment on the device's clock as it was then, read as UTC so it shows the same wherever the device is now. */
function onThatClock(entry: StartedAt): number {
  return entry.startedAtMs + entry.utcOffsetMinutes * MS_PER_MINUTE;
}

export function startedAtTime(
  entry: StartedAt,
  formats: StartedAtFormats,
): string {
  return formats.time.format(onThatClock(entry));
}

export function startedAtWeekdayTime(
  entry: StartedAt,
  formats: StartedAtFormats,
): string {
  return formats.weekdayTime.format(onThatClock(entry));
}

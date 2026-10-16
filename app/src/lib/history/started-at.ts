import type { HistoryEntry } from "#lib/ipc/bindings.ts";

const MS_PER_MINUTE = 60_000;

type StartedAt = Pick<HistoryEntry, "startedAtMs" | "utcOffsetMinutes">;

export interface StartedAtFormats {
  readonly time: Intl.DateTimeFormat;
}

export function startedAtFormats(
  locale: string,
  hourCycle?: Intl.LocaleHourCycleKey,
): StartedAtFormats {
  const clock = hourCycle === undefined ? {} : { hourCycle };
  return {
    time: new Intl.DateTimeFormat(locale, {
      timeStyle: "short",
      timeZone: "UTC",
      ...clock,
    }),
  };
}

/** The moment on the device's clock as it was then, read as UTC so it shows the same wherever the device is now. */
export function onThatClock(entry: StartedAt): number {
  return entry.startedAtMs + entry.utcOffsetMinutes * MS_PER_MINUTE;
}

export function startedAtTime(
  entry: StartedAt,
  formats: StartedAtFormats,
): string {
  return formats.time.format(onThatClock(entry));
}

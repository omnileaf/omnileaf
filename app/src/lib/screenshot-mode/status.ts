import { assertNever } from "#lib/assert-never.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";

import type { ScreenshotModeActivity } from "./screenshot-mode";

function timeOfDay(
  instant: number,
  hourCycle: Intl.LocaleHourCycleKey | undefined,
): string {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: "numeric",
    minute: "2-digit",
    ...(hourCycle === undefined ? {} : { hourCycle }),
  }).format(instant);
}

export function screenshotModeStatus(
  activity: ScreenshotModeActivity,
  hourCycle?: Intl.LocaleHourCycleKey,
): string {
  switch (activity.kind) {
    case "off":
      return m.screenshot_mode_off_status();
    case "on":
      return m.screenshot_mode_on_status();
    case "onUntil":
      return m.screenshot_mode_on_until({
        time: timeOfDay(activity.turnsOffAt, hourCycle),
      });
    default:
      return assertNever(activity);
  }
}

export function screenshotModeSummary(
  activity: ScreenshotModeActivity,
  hourCycle?: Intl.LocaleHourCycleKey,
): string {
  switch (activity.kind) {
    case "off":
      return m.switch_off();
    case "on":
      return m.switch_on();
    case "onUntil":
      return m.screenshot_mode_summary_on_until({
        time: timeOfDay(activity.turnsOffAt, hourCycle),
      });
    default:
      return assertNever(activity);
  }
}

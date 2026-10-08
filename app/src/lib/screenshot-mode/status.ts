import { assertNever } from "#lib/assert-never.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";

import type { ScreenshotModeActivity } from "./screenshot-mode";

function timeOfDay(instant: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

export function screenshotModeStatus(activity: ScreenshotModeActivity): string {
  switch (activity.kind) {
    case "off":
      return m.screenshot_mode_off_status();
    case "on":
      return m.screenshot_mode_on_status();
    case "onUntil":
      return m.screenshot_mode_on_until({
        time: timeOfDay(activity.turnsOffAt),
      });
    default:
      return assertNever(activity);
  }
}

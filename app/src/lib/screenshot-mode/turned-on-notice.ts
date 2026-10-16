import { ScanLine } from "@lucide/svelte";

import type { Platform } from "#lib/ipc/bindings.ts";
import type { Notice } from "#lib/notices/notices.ts";
import { isPointer } from "#lib/page/platform.ts";
import { m } from "#lib/paraglide/messages.js";

import type { ScreenshotModeActivity } from "./screenshot-mode";
import { screenshotModeShortcutLabel } from "./shortcut";
import { timeOfDay } from "./status";

function whenItTurnsOff(
  activity: ScreenshotModeActivity,
  hourCycle: Intl.LocaleHourCycleKey | undefined,
): string | undefined {
  return activity.kind === "onUntil"
    ? m.screenshot_mode_turns_off_at({
        time: timeOfDay(activity.turnsOffAt, hourCycle),
      })
    : undefined;
}

function noticeBody(
  when: string | undefined,
  platform: Platform,
): string | undefined {
  if (!isPointer(platform)) {
    return when;
  }
  const keys = screenshotModeShortcutLabel(platform);
  return when === undefined
    ? keys
    : m.screenshot_mode_notice_keys({ when, keys });
}

export function turnedOnNotice(
  activity: ScreenshotModeActivity,
  platform: Platform,
  hourCycle: Intl.LocaleHourCycleKey | undefined,
  turnOff: () => void,
): Notice {
  const body = noticeBody(whenItTurnsOff(activity, hourCycle), platform);
  return {
    tone: "plain",
    icon: ScanLine,
    title: m.screenshot_mode_now_on(),
    ...(body === undefined ? {} : { body }),
    action: { label: m.screenshot_mode_turn_off(), run: turnOff },
  };
}

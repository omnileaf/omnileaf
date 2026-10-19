import type { TrayMenu } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";
import type { KeyCombination } from "#lib/screenshot-mode/key-combination.ts";
import type { ScreenshotModeActivity } from "#lib/screenshot-mode/screenshot-mode.ts";
import { screenshotModeTrayState } from "#lib/screenshot-mode/status.ts";

export interface TrayState {
  readonly activity: ScreenshotModeActivity;
  readonly hourCycle: Intl.LocaleHourCycleKey | undefined;
  readonly shortcut: KeyCombination;
  readonly hasBookToContinue: boolean;
}

export function trayMenu({
  activity,
  hourCycle,
  shortcut,
  hasBookToContinue,
}: TrayState): TrayMenu {
  return {
    open: m.tray_open(),
    screenshotMode: m.screenshot_mode_title(),
    screenshotModeState: screenshotModeTrayState(activity, hourCycle),
    isScreenshotModeOn: activity.kind !== "off",
    screenshotModeShortcut: { letter: shortcut.letter, shift: shortcut.shift },
    continueReading: m.tray_continue_reading(),
    hasBookToContinue,
    quit: m.tray_quit(),
  };
}

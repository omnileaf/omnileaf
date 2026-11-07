import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { phoneOf } from "#lib/page/platform.ts";

import type { SettingChoiceControl } from "./setting-choice-control.ts";

export interface ReadingSettingsContentLook {
  readonly control: SettingChoiceControl;
}

const TODAYS_LOOK: ReadingSettingsContentLook = {
  control: "toggle",
};

const ANDROID_PHONE_LOOK: ReadingSettingsContentLook = {
  control: "pills",
};

export function readingSettingsContentLook(
  platform: Platform,
  width: WidthClass,
): ReadingSettingsContentLook {
  return phoneOf(platform, width) === "android"
    ? ANDROID_PHONE_LOOK
    : TODAYS_LOOK;
}

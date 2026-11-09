import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { phoneOf } from "#lib/page/platform.ts";
import { ANDROID_LIST_HEADING } from "#lib/settings/android-flush-look.ts";

import type { SettingChoiceControl } from "./setting-choice-control.ts";

export interface ReadingSettingsContentLook {
  readonly control: SettingChoiceControl;
  readonly modeField: ModeField;
  readonly stripModeField: ModeField;
  readonly group: string;
  readonly section: string;
  readonly firstSection: string;
  readonly heading: string;
  readonly smartFeatures: string;
  readonly smartFeaturesSize: "small" | "flat";
}

export type ModeField = "beside" | "outlined" | "row";

const SECTION = "flex flex-col border-be-0";

const TODAYS_LOOK: ReadingSettingsContentLook = {
  control: "toggle",
  modeField: "beside",
  stripModeField: "beside",
  group: "flex flex-col divide-y divide-border",
  section: `${SECTION} pbs-xl`,
  firstSection: SECTION,
  heading: "text-small font-semibold",
  smartFeatures: "pbs-xl",
  smartFeaturesSize: "small",
};

const ANDROID_PHONE_LOOK: ReadingSettingsContentLook = {
  control: "pills",
  modeField: "outlined",
  stripModeField: "row",
  group: "flex flex-col",
  section: SECTION,
  firstSection: SECTION,
  heading: ANDROID_LIST_HEADING,
  smartFeatures: "",
  smartFeaturesSize: "flat",
};

export function readingSettingsContentLook(
  platform: Platform,
  width: WidthClass,
): ReadingSettingsContentLook {
  return phoneOf(platform, width) === "android"
    ? ANDROID_PHONE_LOOK
    : TODAYS_LOOK;
}

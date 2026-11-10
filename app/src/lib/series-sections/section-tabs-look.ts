import type { Platform } from "#lib/ipc/bindings.ts";
import { isPhone } from "#lib/page/platform.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";

export type SectionControls = "choicesFirst" | "choicesAfter" | "heading";

export interface SectionTabsLook {
  readonly row: string;
  readonly list: string;
  readonly controls: SectionControls;
}

const HUGGING_LOOK: SectionTabsLook = {
  row: "flex flex-wrap items-center gap-sm",
  list: "flex-wrap max-inline-full",
  controls: "choicesAfter",
};

const ANDROID_PHONE_LOOK: SectionTabsLook = {
  row: "flex flex-col gap-sm",
  list: "",
  controls: "heading",
};

const IPHONE_LOOK: SectionTabsLook = {
  row: "flex flex-col gap-sm",
  list: "",
  controls: "choicesFirst",
};

export function sectionTabsLook(
  platform: Platform,
  width: WidthClass,
): SectionTabsLook {
  if (!isPhone(platform, width)) {
    return HUGGING_LOOK;
  }
  if (platform === "android") {
    return ANDROID_PHONE_LOOK;
  }
  return platform === "ios" ? IPHONE_LOOK : HUGGING_LOOK;
}

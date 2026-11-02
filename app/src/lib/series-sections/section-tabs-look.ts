import type { Platform } from "#lib/ipc/bindings.ts";
import { isPhone } from "#lib/page/platform.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";

export interface SectionTabsLook {
  readonly row: string;
  readonly list: string;
  readonly choicesFirst: boolean;
}

const HUGGING_LOOK: SectionTabsLook = {
  row: "flex flex-wrap items-center gap-sm",
  list: "flex-wrap max-inline-full",
  choicesFirst: false,
};

const ANDROID_PHONE_LOOK: SectionTabsLook = {
  row: "flex flex-col gap-sm",
  list: "",
  choicesFirst: true,
};

const IPHONE_LOOK: SectionTabsLook = {
  row: "flex flex-col gap-sm",
  list: "",
  choicesFirst: true,
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

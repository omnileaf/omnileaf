import type { Platform } from "#lib/ipc/bindings.ts";
import { isPhone } from "#lib/page/platform.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";

export interface SectionTabsLook {
  readonly row: string;
  readonly list: string;
}

const HUGGING_LOOK: SectionTabsLook = {
  row: "flex flex-wrap items-center gap-sm",
  list: "flex-wrap max-inline-full",
};

const ANDROID_PHONE_LOOK: SectionTabsLook = {
  row: "flex flex-col gap-sm",
  list: "",
};

export function sectionTabsLook(
  platform: Platform,
  width: WidthClass,
): SectionTabsLook {
  return platform === "android" && isPhone(platform, width)
    ? ANDROID_PHONE_LOOK
    : HUGGING_LOOK;
}

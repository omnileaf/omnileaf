import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { phoneOf } from "#lib/page/platform.ts";

export interface JumpTriggerLook {
  readonly button: string;
  readonly series: string;
  readonly book: string;
  readonly bookName: string;
  readonly chevron: string;
  readonly hasKitChevron: boolean;
}

const IOS_LOOK: JumpTriggerLook = {
  button:
    "flex flex-1 flex-col items-center justify-center rounded-full text-center text-native-on-top-bar transition-control min-block-native-target min-inline-none focus-visible:focus-ring active:opacity-50",
  series: "truncate text-small font-semibold max-inline-full",
  book: "flex items-center overflow-hidden text-caption font-medium text-muted max-inline-full",
  bookName: "truncate",
  chevron: "shrink-0",
  hasKitChevron: false,
};

const ANDROID_PHONE_LOOK: JumpTriggerLook = {
  button:
    "relative flex flex-1 flex-col justify-center rounded-small-control px-sm text-start text-foreground transition-control min-block-touch-target min-inline-none hover:bg-hover focus-visible:focus-ring active:bg-pressed",
  series:
    "truncate text-native-bar-title leading-native-bar-title font-native-bar-title tracking-native-bar-title",
  book: "flex items-center gap-2xs overflow-hidden text-native-tab leading-native-tab font-native-tab tracking-native-tab text-muted max-inline-full",
  bookName: "truncate text-foreground",
  chevron: "block-lg inline-lg shrink-0",
  hasKitChevron: true,
};

export function jumpTriggerLook(
  platform: Platform,
  width: WidthClass,
): JumpTriggerLook {
  return phoneOf(platform, width) === "android" ? ANDROID_PHONE_LOOK : IOS_LOOK;
}

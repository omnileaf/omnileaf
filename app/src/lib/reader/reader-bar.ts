import { cn } from "#lib/components/cn.ts";
import {
  buttonClasses,
  variantClasses,
} from "#lib/components/ui/button/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { isPhone } from "#lib/page/platform.ts";

import {
  WINDOWS_COMMAND_BUTTON,
  WINDOWS_ICON_BUTTON,
  WINDOWS_ICON_SIZE,
} from "./windows-reader-bar.ts";

const FLOATS_READER_BARS = {
  android: false,
  ios: true,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

export const READER_GLASS =
  "rounded-reader-glass border border-border bg-background/88 text-foreground shadow-reader-glass backdrop-blur-reader android:border-transparent android:bg-android-container android:backdrop-blur-none";

export const EDGE_TO_EDGE_BARS = "bg-native-top-bar-scrolled text-foreground";

export const READER_BUTTON =
  "relative flex shrink-0 items-center justify-center rounded-shadcn-control text-foreground transition-control block-reader-dense inline-reader-dense hover:bg-hover active:bg-pressed desktop:expanded:block-pointer-button desktop:expanded:inline-pointer-button android:before:absolute android:before:block-touch-target android:before:inline-touch-target";

export const READER_ICON_SIZE = 18;

export const READER_CAPSULE =
  "flex items-center rounded-full bg-native-bar-button text-native-on-top-bar shadow-native-bar-button-lift backdrop-blur-ios";

const CAPSULE_BUTTON =
  "relative flex shrink-0 items-center justify-center rounded-full transition-control block-native-target inline-native-target focus-visible:focus-ring focus-visible:-outline-offset-2 active:opacity-50 aria-pressed:bg-native-tab-pill";

const ANDROID_BAR_BUTTON = cn(
  variantClasses("plain", "regular", true, "android"),
  "text-muted",
);

export function floatsReaderBars(
  platform: Platform,
  width: WidthClass,
): boolean {
  return FLOATS_READER_BARS[platform] && isPhone(platform, width);
}

export function spansReaderBars(
  platform: Platform,
  width: WidthClass,
): boolean {
  return isPhone(platform, width) && !FLOATS_READER_BARS[platform];
}

export function readerIconSize(platform: Platform): number {
  return platform === "windows" ? WINDOWS_ICON_SIZE : READER_ICON_SIZE;
}

export function readerCommandButton(
  platform: Platform,
  width: WidthClass,
): string {
  return platform === "windows"
    ? WINDOWS_COMMAND_BUTTON
    : readerButton(platform, width);
}

export function readerButton(platform: Platform, width: WidthClass): string {
  if (platform === "windows") {
    return WINDOWS_ICON_BUTTON;
  }
  if (floatsReaderBars(platform, width)) {
    return CAPSULE_BUTTON;
  }
  return spansReaderBars(platform, width) ? ANDROID_BAR_BUTTON : READER_BUTTON;
}

export function readerBackLook(platform: Platform, width: WidthClass): string {
  if (platform === "windows") {
    return WINDOWS_ICON_BUTTON;
  }
  return isPhone(platform, width)
    ? buttonClasses("header-control", platform, { width })
    : READER_BUTTON;
}

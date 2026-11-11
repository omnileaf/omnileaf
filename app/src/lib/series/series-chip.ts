import { variantClasses } from "#lib/components/ui/button/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { isPhone, phoneOf } from "#lib/page/platform.ts";
import { NATIVE_TOP_BAR } from "#lib/page/top-bar.ts";

export const SERIES_CHIP =
  "shrink-0 border border-border bg-card text-foreground shadow-raised block-touch-target inline-touch-target";

const WINDOWS_BAR_BUTTON = variantClasses("plain", "regular", true, "windows");

const ANDROID_BAR_BUTTON =
  "android:native-target android:block-native-button android:inline-native-button";

const ANDROID_BAND_CHIP = `android:bg-native-button-secondary android:text-native-on-button-secondary ${ANDROID_BAR_BUTTON}`;

export type BarPlacement = "band" | "folded";

type AndroidChips = Record<BarPlacement, string>;

const ANDROID_BACK_CHIP = {
  band: ANDROID_BAND_CHIP,
  folded: `android:text-native-on-top-bar ${ANDROID_BAR_BUTTON}`,
} satisfies AndroidChips;

const ANDROID_MENU_CHIP = {
  band: ANDROID_BAND_CHIP,
  folded: ANDROID_BAR_BUTTON,
} satisfies AndroidChips;

export function barChip(platform: Platform, width: WidthClass): string {
  if (platform === "windows") {
    return WINDOWS_BAR_BUTTON;
  }
  if (!isPhone(platform, width)) {
    return SERIES_CHIP;
  }
  return NATIVE_TOP_BAR.barButton;
}

function placedChip(
  platform: Platform,
  width: WidthClass,
  android: string,
): string {
  const chip = barChip(platform, width);
  return phoneOf(platform, width) === "android" ? `${chip} ${android}` : chip;
}

export function backChip(
  platform: Platform,
  width: WidthClass,
  placement: BarPlacement,
): string {
  return placedChip(platform, width, ANDROID_BACK_CHIP[placement]);
}

export function menuChip(
  platform: Platform,
  width: WidthClass,
  placement: BarPlacement,
): string {
  return placedChip(platform, width, ANDROID_MENU_CHIP[placement]);
}

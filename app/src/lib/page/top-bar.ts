import type { Platform } from "#lib/ipc/bindings.ts";
import type { IconName } from "#lib/icons/names.ts";

export const NATIVE_TOP_BAR = {
  pageTitle:
    "flex items-center text-native-page-title leading-native-page-title font-native-page-title tracking-native-page-title text-native-on-top-bar min-block-native-top-bar",
  barTitle:
    "text-native-bar-title leading-native-bar-title font-native-bar-title tracking-native-bar-title text-native-on-top-bar",
  barButton:
    "shrink-0 rounded-full bg-native-bar-button text-native-on-bar-button shadow-native-bar-button-lift ios:backdrop-blur-ios block-native-target inline-native-target",
  barButtonGroup:
    "flex shrink-0 items-center rounded-full bg-native-bar-button shadow-native-bar-button-lift ios:backdrop-blur-ios *:bg-transparent *:shadow-none *:backdrop-blur-none",
  edge: "border-be-(length:--native-spacing-hairline)",
  scrolled:
    "border-native-top-bar-scrolled-edge bg-native-top-bar-scrolled backdrop-blur-ios",
  lift: "-mbs-native-top-bar-lift",
};

const BACK_ICON = {
  android: "arrow-left",
  ios: "chevron-left",
  linux: "chevron-left",
  macos: "chevron-left",
  windows: "chevron-left",
} satisfies Record<Platform, IconName>;

export function backIcon(platform: Platform): IconName {
  return BACK_ICON[platform];
}

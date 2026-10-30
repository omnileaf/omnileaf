import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";

import { floatsReaderBars } from "./reader-bar.ts";
import {
  WINDOWS_COMMAND_BUTTON,
  WINDOWS_COMMAND_LABEL,
  WINDOWS_ICON_SIZE,
  WINDOWS_TOGGLED_ON,
} from "./windows-reader-bar.ts";

export interface QuickSettingLook {
  readonly button: string;
  readonly toggle: string;
  readonly toggleLabel: string;
  readonly lit: string;
  readonly on: string;
  readonly iconSize: number;
  readonly hasKitIcons: boolean;
  readonly hasChevron: boolean;
}

const SEGMENT_LIT = "bg-hover";

const SEGMENT_LOOK: QuickSettingLook = {
  button:
    "-ms-px flex flex-auto items-center justify-center gap-icon-gap border border-border px-sm text-small font-medium whitespace-nowrap text-foreground transition-control first:ms-none first:rounded-s-shadcn-button last:rounded-e-shadcn-button min-block-touch-target hover:bg-hover large:flex-none large:px-md desktop:expanded:min-block-pointer-button",
  toggle: "",
  toggleLabel: "",
  lit: SEGMENT_LIT,
  on: `${SEGMENT_LIT} font-semibold`,
  iconSize: 16,
  hasKitIcons: false,
  hasChevron: true,
};

const CAPSULE_LIT = "bg-native-tab-pill";

const CAPSULE_LOOK: QuickSettingLook = {
  button:
    "flex items-center justify-center gap-xs rounded-full px-md text-native-button leading-native-button font-native-button tracking-native-button whitespace-nowrap transition-control min-block-native-target min-inline-native-target focus-visible:focus-ring focus-visible:-outline-offset-2 active:opacity-50",
  toggle: "px-none",
  toggleLabel: "sr-only",
  lit: CAPSULE_LIT,
  on: CAPSULE_LIT,
  iconSize: 22,
  hasKitIcons: true,
  hasChevron: true,
};

const WINDOWS_LOOK: QuickSettingLook = {
  button: WINDOWS_COMMAND_BUTTON,
  toggle: "",
  toggleLabel: WINDOWS_COMMAND_LABEL,
  lit: WINDOWS_TOGGLED_ON,
  on: "",
  iconSize: WINDOWS_ICON_SIZE,
  hasKitIcons: false,
  hasChevron: false,
};

export function quickSettingLook(
  platform: Platform,
  width: WidthClass,
): QuickSettingLook {
  if (platform === "windows") {
    return WINDOWS_LOOK;
  }
  return floatsReaderBars(platform, width) ? CAPSULE_LOOK : SEGMENT_LOOK;
}

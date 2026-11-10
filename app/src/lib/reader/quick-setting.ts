import { cn } from "#lib/components/cn.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { phoneOf } from "#lib/page/platform.ts";

import { floatsReaderBars, READER_CAPSULE } from "./reader-bar.ts";
import {
  WINDOWS_COMMAND_BUTTON,
  WINDOWS_COMMAND_LABEL,
  usesCommandBar,
  WINDOWS_ICON_SIZE,
  WINDOWS_TOGGLED_ON,
} from "./windows-reader-bar.ts";

export type AutoMarkRoom = "inline" | "behind";

export interface QuickSettingLook {
  readonly button: string;
  readonly toggle: string;
  readonly toggleLabel: string;
  readonly lit: string;
  readonly on: string;
  readonly iconSize: number;
  readonly hasKitIcons: boolean;
  readonly hasChevron: boolean;
  readonly directionName: string;
  readonly autoMark: string;
  readonly autoMarkRoom: AutoMarkRoom;
  readonly hasPill: boolean;
  readonly pill: string;
  readonly words: string;
  readonly group: string;
}

const AUTO_MARK =
  "rounded-shadcn-control border border-border px-xs text-caption font-medium";

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
  directionName: "truncate",
  autoMark: AUTO_MARK,
  autoMarkRoom: "inline",
  hasPill: false,
  pill: "",
  words: "contents",
  group:
    "flex flex-wrap items-stretch rounded-shadcn-control shadow-raised large:hidden",
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
  directionName: "truncate",
  autoMark: AUTO_MARK,
  autoMarkRoom: "inline",
  hasPill: false,
  pill: "",
  words: "contents",
  group: cn(READER_CAPSULE, "flex-wrap justify-center px-2xs max-inline-full"),
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
  directionName: "text-center max-medium:sr-only",
  autoMark: "sr-only",
  autoMarkRoom: "inline",
  hasPill: false,
  pill: "",
  words: "contents",
  group: "flex flex-wrap items-center justify-center gap-2xs large:hidden",
};

const STRIP_PILL_TINT =
  "[&>[data-pill]]:bg-native-tab-pill [&>[data-pill]]:text-native-on-tab-pill";

const STRIP_LIT = `text-foreground ${STRIP_PILL_TINT}`;

const STRIP_LOOK: QuickSettingLook = {
  button:
    "flex min-inline-none flex-1 basis-0 flex-col items-center gap-xs pbs-xs pbe-native-reader-quick-button-end text-native-tab leading-native-tab font-native-tab tracking-native-tab text-muted transition-control focus-visible:focus-ring focus-visible:-outline-offset-2",
  toggle: "",
  toggleLabel: "",
  lit: STRIP_LIT,
  on: STRIP_LIT,
  iconSize: 24,
  hasKitIcons: true,
  hasChevron: false,
  directionName: "truncate",
  autoMark:
    "rounded-auto-mark border border-current px-xs text-reader-thumbnail font-medium tracking-native-tab",
  autoMarkRoom: "behind",
  hasPill: true,
  pill: "flex items-center justify-center rounded-full block-native-reader-quick-pill-block inline-native-reader-quick-pill-inline",
  words:
    "flex max-inline-full flex-wrap items-center justify-center gap-x-xs gap-y-2xs",
  group: "-mx-sm flex",
};

export function quickSettingLook(
  platform: Platform,
  width: WidthClass,
): QuickSettingLook {
  if (usesCommandBar(platform)) {
    return WINDOWS_LOOK;
  }
  if (phoneOf(platform, width) === "android") {
    return STRIP_LOOK;
  }
  return floatsReaderBars(platform, width) ? CAPSULE_LOOK : SEGMENT_LOOK;
}

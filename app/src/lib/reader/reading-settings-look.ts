import type { SheetBackdrop } from "#lib/components/ui/drawer/sheet.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { phoneOf } from "#lib/page/platform.ts";
import { ANDROID_SHEET_INLINE } from "#lib/settings/android-flush-look.ts";

export interface ReadingSettingsSheetLook {
  readonly backdrop: SheetBackdrop;
  readonly header: string;
  readonly title: string;
  readonly body: string;
  readonly hasBadge: boolean;
  readonly hasDone: boolean;
}

const TODAYS_LOOK: ReadingSettingsSheetLook = {
  backdrop: "dimmed",
  header: "flex items-center gap-sm px-sheet-inline pbs-sheet-gap",
  title: "flex-1 text-body font-semibold",
  body: "px-sheet-inline",
  hasBadge: true,
  hasDone: true,
};

const ANDROID_PHONE_LOOK: ReadingSettingsSheetLook = {
  backdrop: "clear",
  header: "flex items-center px-lg pbs-sheet-gap",
  title:
    "flex-1 text-native-bar-title leading-native-bar-title font-native-bar-title tracking-native-bar-title",
  body: ANDROID_SHEET_INLINE,
  hasBadge: false,
  hasDone: false,
};

export function readingSettingsSheetLook(
  platform: Platform,
  width: WidthClass,
): ReadingSettingsSheetLook {
  return phoneOf(platform, width) === "android"
    ? ANDROID_PHONE_LOOK
    : TODAYS_LOOK;
}

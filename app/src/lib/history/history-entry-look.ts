import {
  ROW_SUBTITLE_TYPE,
  ROW_TITLE_TYPE,
} from "#lib/components/ui/item/looks.ts";
import type { NativeTrack } from "#lib/components/ui/progress/index.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import { ANDROID_LIST_COVER } from "#lib/library/list-row-look.ts";
import type { WidthClass } from "#lib/page/breakpoints.ts";
import { phoneOf } from "#lib/page/platform.ts";

export interface HistoryEntryLook {
  readonly title: string;
  readonly line: string;
  readonly opensMenu: boolean;
  readonly menuButton: string;
  readonly bar: string;
  readonly barTrack: NativeTrack;
  readonly cover: string;
  readonly coverSkeleton: string;
  readonly showsFinishedBar: boolean;
}

const TODAYS_COVER = "rounded-history-cover inline-history-cover";
const TODAYS_COVER_SKELETON = `${TODAYS_COVER} block-history-cover`;

const TODAYS_LOOK: HistoryEntryLook = {
  title: "line-clamp-2 text-small font-semibold",
  line: "line-clamp-2 text-detail text-muted tabular-nums",
  opensMenu: false,
  menuButton: "hidden large:flex",
  bar: "inline-history-bar",
  barTrack: "split",
  cover: TODAYS_COVER,
  coverSkeleton: TODAYS_COVER_SKELETON,
  showsFinishedBar: true,
};

const ANDROID_LOOK: HistoryEntryLook = {
  title: `line-clamp-2 ${ROW_TITLE_TYPE}`,
  line: `line-clamp-2 text-muted tabular-nums ${ROW_SUBTITLE_TYPE}`,
  opensMenu: true,
  menuButton:
    "flex block-touch-target inline-touch-target before:block-touch-target before:inline-touch-target",
  bar: "inline-full",
  barTrack: "continuous",
  cover: TODAYS_COVER,
  coverSkeleton: TODAYS_COVER_SKELETON,
  showsFinishedBar: false,
};

const ANDROID_PHONE_LOOK: HistoryEntryLook = {
  ...ANDROID_LOOK,
  cover: ANDROID_LIST_COVER,
  coverSkeleton: `aspect-cover ${ANDROID_LIST_COVER}`,
};

const HISTORY_ENTRY_LOOKS = {
  android: ANDROID_LOOK,
  ios: TODAYS_LOOK,
  linux: TODAYS_LOOK,
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, HistoryEntryLook>;

export function historyEntryLook(
  platform: Platform,
  width: WidthClass,
): HistoryEntryLook {
  return phoneOf(platform, width) === "android"
    ? ANDROID_PHONE_LOOK
    : HISTORY_ENTRY_LOOKS[platform];
}

import {
  ROW_SUBTITLE_TYPE,
  ROW_TITLE_TYPE,
} from "#lib/components/ui/item/looks.ts";
import type { Platform } from "#lib/ipc/bindings.ts";

export interface HistoryEntryLook {
  readonly title: string;
  readonly line: string;
  readonly opensMenu: boolean;
  readonly menuButton: string;
  readonly bar: string;
}

const TODAYS_LOOK: HistoryEntryLook = {
  title: "line-clamp-2 text-small font-semibold",
  line: "line-clamp-2 text-detail text-muted tabular-nums",
  opensMenu: false,
  menuButton: "hidden large:flex",
  bar: "inline-history-bar",
};

const ANDROID_LOOK: HistoryEntryLook = {
  title: `line-clamp-2 ${ROW_TITLE_TYPE}`,
  line: `line-clamp-2 text-muted tabular-nums ${ROW_SUBTITLE_TYPE}`,
  opensMenu: true,
  menuButton:
    "flex block-touch-target inline-touch-target before:block-touch-target before:inline-touch-target",
  bar: "inline-history-bar max-medium:inline-native-history-bar",
};

const HISTORY_ENTRY_LOOKS = {
  android: ANDROID_LOOK,
  ios: TODAYS_LOOK,
  linux: TODAYS_LOOK,
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
} satisfies Record<Platform, HistoryEntryLook>;

export function historyEntryLook(platform: Platform): HistoryEntryLook {
  return HISTORY_ENTRY_LOOKS[platform];
}

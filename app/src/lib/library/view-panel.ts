import type { Platform } from "#lib/ipc/bindings.ts";

import {
  type GroupLook,
  PLAIN_GROUP_LOOK,
  POPOVER_GROUP_LOOK,
} from "./group-look";

export interface ViewPanelLook {
  readonly width: string;
  readonly surface: string;
  readonly title: string;
  readonly groups: GroupLook;
}

const PANEL_SPACING =
  "gap-native-popover-gap pbs-native-popover-top pbe-native-popover-bottom";

const TODAYS_LOOK: ViewPanelLook = {
  width: "inline-view-panel",
  surface: `${PANEL_SPACING} px-panel-inline`,
  title: "text-panel-title font-bold",
  groups: PLAIN_GROUP_LOOK,
};

const IPAD_LOOK: ViewPanelLook = {
  ...TODAYS_LOOK,
  surface: `${PANEL_SPACING} rounded-native-sheet border-0 bg-native-popover shadow-native-popover-lift backdrop-blur-native-popover backdrop-saturate-180`,
  title:
    "px-lg text-native-bar-title/native-bar-title font-native-bar-title tracking-native-bar-title",
  groups: POPOVER_GROUP_LOOK,
};

const VIEW_PANEL_LOOKS = {
  linux: { ...TODAYS_LOOK, width: "inline-view-panel-wide" },
  macos: TODAYS_LOOK,
  windows: TODAYS_LOOK,
  ios: IPAD_LOOK,
  android: TODAYS_LOOK,
} satisfies Record<Platform, ViewPanelLook>;

export function viewPanelLook(platform: Platform): ViewPanelLook {
  return VIEW_PANEL_LOOKS[platform];
}

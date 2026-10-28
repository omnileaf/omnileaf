import type { Platform } from "#lib/ipc/bindings.ts";

const TODAYS_WIDTH = "inline-view-panel";

const VIEW_PANEL_WIDTHS = {
  linux: "inline-view-panel-wide",
  macos: TODAYS_WIDTH,
  windows: TODAYS_WIDTH,
  ios: TODAYS_WIDTH,
  android: TODAYS_WIDTH,
} satisfies Record<Platform, string>;

export function viewPanelWidth(platform: Platform): string {
  return VIEW_PANEL_WIDTHS[platform];
}

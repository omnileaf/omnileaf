import type { IconActionsMenu } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";
import type { ScreenshotModeActivity } from "#lib/screenshot-mode/screenshot-mode.ts";

export function iconActionsMenu(
  activity: ScreenshotModeActivity,
): IconActionsMenu {
  const state = activity.kind === "off" ? m.switch_off() : m.switch_on();
  return {
    screenshotMode: m.screenshot_mode_title(),
    screenshotModeState: state,
    screenshotModeWithState: m.icon_action_screenshot_mode_with_state({
      state,
    }),
    continueReading: m.icon_action_continue_reading(),
    searchLibrary: m.icon_action_search_library(),
  };
}

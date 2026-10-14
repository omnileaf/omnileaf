import type { Platform } from "#lib/ipc/bindings.ts";
import { usesCommandKey } from "#lib/page/platform.ts";
import { m } from "#lib/paraglide/messages.js";

export function screenshotModeShortcutLabel(platform: Platform): string {
  return usesCommandKey(platform)
    ? m.screenshot_mode_shortcut_command()
    : m.screenshot_mode_shortcut_control();
}

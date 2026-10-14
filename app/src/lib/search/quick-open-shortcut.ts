import type { Platform } from "#lib/ipc/bindings.ts";
import { usesCommandKey } from "#lib/page/platform.ts";
import { m } from "#lib/paraglide/messages.js";

export function quickOpenShortcutLabel(platform: Platform): string {
  return usesCommandKey(platform)
    ? m.quick_open_shortcut_mac()
    : m.quick_open_shortcut();
}

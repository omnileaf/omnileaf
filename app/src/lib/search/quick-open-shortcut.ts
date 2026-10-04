import type { Platform } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

const SHORTCUT_KEY = "k";

/** Apple's systems take the Command key for shortcuts where the others take Control. */
function usesCommandKey(platform: Platform): boolean {
  switch (platform) {
    case "macos":
    case "ios":
      return true;
    case "android":
    case "windows":
    case "linux":
      return false;
  }
}

export function isQuickOpenShortcut(
  event: KeyboardEvent,
  platform: Platform,
): boolean {
  const modifier = usesCommandKey(platform) ? event.metaKey : event.ctrlKey;
  const other = usesCommandKey(platform) ? event.ctrlKey : event.metaKey;
  return (
    modifier &&
    !other &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === SHORTCUT_KEY
  );
}

export function quickOpenShortcutLabel(platform: Platform): string {
  return usesCommandKey(platform)
    ? m.quick_open_shortcut_mac()
    : m.quick_open_shortcut();
}

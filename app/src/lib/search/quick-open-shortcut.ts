import type { Platform } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

const SHORTCUT_KEY = "k";
const SHORTCUT_CODE = "KeyK";
const LATIN_LETTER = /^[a-z]$/u;

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
    isShortcutKey(event)
  );
}

/** Takes the K key by its place on the keyboard when the layout types a letter there that isn't Latin. */
function isShortcutKey(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  return LATIN_LETTER.test(key)
    ? key === SHORTCUT_KEY
    : event.code === SHORTCUT_CODE;
}

export function quickOpenShortcutLabel(platform: Platform): string {
  return usesCommandKey(platform)
    ? m.quick_open_shortcut_mac()
    : m.quick_open_shortcut();
}

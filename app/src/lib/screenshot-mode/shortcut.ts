import type { Platform } from "#lib/ipc/bindings.ts";
import { usesCommandKey } from "#lib/page/platform.ts";
import { m } from "#lib/paraglide/messages.js";

export type KeyPress = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "repeat"
>;

export interface ScreenshotModeShortcut {
  readonly label: () => string;
  readonly isModifierHeld: (press: KeyPress) => boolean;
}

const SHORTCUT_LETTER = "h";
const SHORTCUT_KEY_CODE = "KeyH";
const LATIN_LETTER = /^[a-z]$/i;

const COMMAND_SHIFT_H: ScreenshotModeShortcut = {
  label: m.screenshot_mode_shortcut_command,
  isModifierHeld: (press) => press.metaKey && !press.ctrlKey,
};

const CONTROL_SHIFT_H: ScreenshotModeShortcut = {
  label: m.screenshot_mode_shortcut_control,
  isModifierHeld: (press) => press.ctrlKey && !press.metaKey,
};

export function screenshotModeShortcutOn(
  platform: Platform,
): ScreenshotModeShortcut {
  return usesCommandKey(platform) ? COMMAND_SHIFT_H : CONTROL_SHIFT_H;
}

/** Layouts without Latin letters report their own character, so there the physical H key stands in. */
function isShortcutLetter({ key, code }: KeyPress): boolean {
  return LATIN_LETTER.test(key)
    ? key.toLowerCase() === SHORTCUT_LETTER
    : code === SHORTCUT_KEY_CODE;
}

export function isScreenshotModeShortcut(
  shortcut: ScreenshotModeShortcut,
  press: KeyPress,
): boolean {
  return (
    shortcut.isModifierHeld(press) &&
    press.shiftKey &&
    !press.altKey &&
    !press.repeat &&
    isShortcutLetter(press)
  );
}

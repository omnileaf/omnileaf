import type { Platform } from "$lib/ipc/bindings";
import { m } from "$lib/paraglide/messages.js";

export interface UndoShortcut {
  readonly label: () => string;
  readonly keys: string;
  readonly isModifierHeld: (event: KeyboardEvent) => boolean;
}

const COMMAND_Z: UndoShortcut = {
  label: m.undo_shortcut_command,
  keys: "Meta+Z",
  isModifierHeld: (event) => event.metaKey && !event.ctrlKey,
};

const CONTROL_Z: UndoShortcut = {
  label: m.undo_shortcut_control,
  keys: "Control+Z",
  isModifierHeld: (event) => event.ctrlKey && !event.metaKey,
};

const APPLE_PLATFORMS: ReadonlySet<Platform> = new Set(["macos", "ios"]);

export function undoShortcutOn(platform: Platform): UndoShortcut {
  return APPLE_PLATFORMS.has(platform) ? COMMAND_Z : CONTROL_Z;
}

const LATIN_LETTER = /^[a-z]$/i;

function isZKey({ key, code }: KeyboardEvent): boolean {
  return LATIN_LETTER.test(key) ? key.toLowerCase() === "z" : code === "KeyZ";
}

export function isUndoPressed(
  shortcut: UndoShortcut,
  event: KeyboardEvent,
): boolean {
  return (
    shortcut.isModifierHeld(event) &&
    !event.shiftKey &&
    !event.altKey &&
    isZKey(event)
  );
}

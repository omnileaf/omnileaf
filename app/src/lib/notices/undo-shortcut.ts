import { createContext } from "svelte";

import type { Platform } from "#lib/ipc/bindings.ts";
import { usesCommandKey } from "#lib/page/platform.ts";
import { m } from "#lib/paraglide/messages.js";

export interface UndoShortcut {
  readonly label: () => string;
  readonly keys: string;
}

const COMMAND_Z: UndoShortcut = {
  label: m.undo_shortcut_command,
  keys: "Meta+Z",
};

const CONTROL_Z: UndoShortcut = {
  label: m.undo_shortcut_control,
  keys: "Control+Z",
};

export function undoShortcutOn(platform: Platform): UndoShortcut {
  return usesCommandKey(platform) ? COMMAND_Z : CONTROL_Z;
}

export const [getUndoShortcut, setUndoShortcut] = createContext<UndoShortcut>();

import { on } from "svelte/events";

import type { Platform } from "#lib/ipc/bindings.ts";
import { usesCommandKey } from "#lib/page/platform.ts";

export interface Shortcut {
  /** A Latin letter, read from where it sits on layouts without Latin letters, or a `KeyboardEvent.key` name such as `Escape`. */
  readonly key: string;
  /** Holds ⌘ on macOS and iOS, or Ctrl elsewhere, with the other released; left out, neither may be held. */
  readonly command?: Platform;
  /** Whether Shift must be held or released; left out, either will do. */
  readonly shift?: boolean;
  readonly inTextFields?: boolean;
  readonly ignoresRepeats?: boolean;
  readonly run: (event: KeyboardEvent) => void;
}

const LATIN_LETTER = /^[a-z]$/i;
const TEXT_FIELDS =
  'input:not([type="range"]), textarea, select, [contenteditable]';
const SLIDER_KEYS: ReadonlySet<string> = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);
const ACTIVATING_KEYS: ReadonlySet<string> = new Set([" ", "Enter"]);

function isCommandAsDeclared(
  command: Platform | undefined,
  { ctrlKey, metaKey }: KeyboardEvent,
): boolean {
  if (command === undefined) {
    return !ctrlKey && !metaKey;
  }
  return usesCommandKey(command) ? metaKey && !ctrlKey : ctrlKey && !metaKey;
}

function areModifiersAsDeclared(
  { command, shift }: Shortcut,
  event: KeyboardEvent,
): boolean {
  return (
    isCommandAsDeclared(command, event) &&
    !event.altKey &&
    (shift === undefined || shift === event.shiftKey)
  );
}

function isKeyPressed(
  key: string,
  { key: pressed, code }: KeyboardEvent,
): boolean {
  if (!LATIN_LETTER.test(key)) {
    return pressed === key;
  }
  return LATIN_LETTER.test(pressed)
    ? pressed.toLowerCase() === key.toLowerCase()
    : code === `Key${key.toUpperCase()}`;
}

function isInTextField({ target }: KeyboardEvent): boolean {
  return target instanceof Element && target.closest(TEXT_FIELDS) !== null;
}

/** Whether the focused control acts on the key itself, as a slider does on arrows and a button on Space. */
function isKeyForFocusedControl({ target, key }: KeyboardEvent): boolean {
  if (target instanceof HTMLInputElement) {
    return SLIDER_KEYS.has(key);
  }
  if (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement
  ) {
    return ACTIVATING_KEYS.has(key);
  }
  return false;
}

function isShortcutPressed(shortcut: Shortcut, event: KeyboardEvent): boolean {
  return (
    !(shortcut.ignoresRepeats === true && event.repeat) &&
    areModifiersAsDeclared(shortcut, event) &&
    isKeyPressed(shortcut.key, event) &&
    (shortcut.inTextFields === true || !isInTextField(event)) &&
    !isKeyForFocusedControl(event)
  );
}

export function shortcut(
  ...shortcuts: readonly Shortcut[]
): (target: Window) => () => void {
  return (target) =>
    on(target, "keydown", (event) => {
      if (event.defaultPrevented) {
        return;
      }
      const pressed = shortcuts.find((declared) =>
        isShortcutPressed(declared, event),
      );
      if (pressed === undefined) {
        return;
      }
      event.preventDefault();
      pressed.run(event);
    });
}

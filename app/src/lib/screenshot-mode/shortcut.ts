export type KeyPress = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "repeat"
>;

const SHORTCUT_LETTER = "h";
const SHORTCUT_KEY_CODE = "KeyH";
const LATIN_LETTER = /^[a-z]$/i;

/** Layouts without Latin letters report their own character, so there the physical H key stands in. */
function isShortcutLetter({ key, code }: KeyPress): boolean {
  return LATIN_LETTER.test(key)
    ? key.toLowerCase() === SHORTCUT_LETTER
    : code === SHORTCUT_KEY_CODE;
}

export function isScreenshotModeShortcut(press: KeyPress): boolean {
  return (
    press.ctrlKey &&
    press.shiftKey &&
    !press.altKey &&
    !press.metaKey &&
    !press.repeat &&
    isShortcutLetter(press)
  );
}

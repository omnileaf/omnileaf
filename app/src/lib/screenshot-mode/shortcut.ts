export type KeyPress = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "repeat"
>;

const SHORTCUT_LETTER = "h";

export function isScreenshotModeShortcut(press: KeyPress): boolean {
  return (
    press.ctrlKey &&
    press.shiftKey &&
    !press.altKey &&
    !press.metaKey &&
    !press.repeat &&
    press.key.toLowerCase() === SHORTCUT_LETTER
  );
}

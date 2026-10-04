export type ReaderAction =
  "next" | "previous" | "first" | "last" | "toggleControls" | "close";

const SPACE = " ";
const CONTROLS_CODE = "KeyM";

const PLAIN_KEYS: Readonly<Record<string, ReaderAction>> = {
  ArrowRight: "next",
  PageDown: "next",
  ArrowLeft: "previous",
  PageUp: "previous",
  Home: "first",
  End: "last",
  Escape: "close",
};

/** What a key asks of a book read left to right, or nothing for a key the reader leaves alone. */
export function readerActionFor(
  event: KeyboardEvent,
): ReaderAction | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return undefined;
  }
  if (event.code === CONTROLS_CODE) {
    return "toggleControls";
  }
  if (event.key === SPACE) {
    return event.shiftKey ? "previous" : "next";
  }
  return event.shiftKey ? undefined : PLAIN_KEYS[event.key];
}

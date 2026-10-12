export type ReaderAction =
  | "next"
  | "previous"
  | "first"
  | "last"
  | "toggleControls"
  | "fullScreen"
  | "leave";

const SPACE = " ";
const CODE_ACTIONS: Readonly<Record<string, ReaderAction>> = {
  KeyM: "toggleControls",
  KeyF: "fullScreen",
};

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
const ACTIVATING_KEYS: ReadonlySet<string> = new Set([SPACE, "Enter"]);

const PLAIN_KEYS: Readonly<Record<string, ReaderAction>> = {
  ArrowRight: "next",
  PageDown: "next",
  ArrowLeft: "previous",
  PageUp: "previous",
  Home: "first",
  End: "last",
  Escape: "leave",
};

export function readerActionFor(
  event: KeyboardEvent,
): ReaderAction | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return undefined;
  }
  const byCode = CODE_ACTIONS[event.code];
  if (byCode !== undefined) {
    return byCode;
  }
  if (event.key === SPACE) {
    return event.shiftKey ? "previous" : "next";
  }
  return event.shiftKey ? undefined : PLAIN_KEYS[event.key];
}

/** Whether the focused control acts on the key itself, as a slider does on arrows and a button on Space, so the reader leaves it alone. */
export function isKeyForFocusedControl(event: KeyboardEvent): boolean {
  const { target } = event;
  if (target instanceof HTMLInputElement) {
    return SLIDER_KEYS.has(event.key);
  }
  if (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement
  ) {
    return ACTIVATING_KEYS.has(event.key);
  }
  return false;
}

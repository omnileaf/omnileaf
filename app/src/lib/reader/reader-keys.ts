import {
  inReadingOrder,
  type ReadingDirection,
} from "#lib/reader/reading-direction.svelte.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import type { Shortcut } from "#lib/shortcut.ts";

export type ReaderAction =
  | "next"
  | "previous"
  | "first"
  | "last"
  | "toggleControls"
  | "fullScreen"
  | "leave"
  | "zoomIn"
  | "zoomOut"
  | "zoomFit"
  | "shortcuts"
  | "jump";

const ARROWS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowRight"]);

type ReaderKey = Pick<Shortcut, "key" | "shift"> & {
  readonly action: ReaderAction;
  readonly isCommand?: boolean;
};

const READER_KEYS: readonly ReaderKey[] = [
  { key: "ArrowRight", shift: false, action: "next" },
  { key: "PageDown", shift: false, action: "next" },
  { key: " ", shift: false, action: "next" },
  { key: "ArrowLeft", shift: false, action: "previous" },
  { key: "PageUp", shift: false, action: "previous" },
  { key: " ", shift: true, action: "previous" },
  { key: "Home", shift: false, action: "first" },
  { key: "End", shift: false, action: "last" },
  { key: "Escape", shift: false, action: "leave" },
  { key: "m", action: "toggleControls" },
  { key: "f", action: "fullScreen" },
  { key: "?", action: "shortcuts" },
  { key: "g", action: "jump" },
  { key: "=", isCommand: true, action: "zoomIn" },
  { key: "+", isCommand: true, action: "zoomIn" },
  { key: "-", isCommand: true, action: "zoomOut" },
  { key: "0", isCommand: true, action: "zoomFit" },
];

function isPageTurn(action: ReaderAction): action is "next" | "previous" {
  return action === "next" || action === "previous";
}

/** The reader's keys, with the arrows turning the way the book reads. */
export function readerShortcuts(
  act: (action: ReaderAction) => void,
  direction: () => ReadingDirection,
  platform: Platform,
): Shortcut[] {
  return READER_KEYS.map(({ action, isCommand = false, ...keys }) => ({
    ...keys,
    ...(isCommand ? { command: platform } : {}),
    run: () => {
      act(
        ARROWS.has(keys.key) && isPageTurn(action)
          ? inReadingOrder(action, direction())
          : action,
      );
    },
  }));
}

import {
  inReadingOrder,
  type ReadingDirection,
  type ReadingMode,
} from "#lib/reader/reading-direction.svelte.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import { usesCommandKey } from "#lib/page/platform.ts";
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
  | "jump"
  | "back";

const ARROWS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowRight"]);

type ReaderKey = Pick<Shortcut, "key" | "shift" | "alt"> & {
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

const STRIP_KEYS: readonly ReaderKey[] = [
  { key: "ArrowDown", shift: false, action: "next" },
  { key: "ArrowUp", shift: false, action: "previous" },
];

function isPageTurn(action: ReaderAction): action is "next" | "previous" {
  return action === "next" || action === "previous";
}

/** The reader's keys, with the arrows turning the way the book reads. */
/** Back to the series the way the platform's own apps go back: ⌘ [ on Apple's, Alt ← elsewhere. */
function backKey(platform: Platform): ReaderKey {
  return usesCommandKey(platform)
    ? { key: "[", isCommand: true, action: "back" }
    : { key: "ArrowLeft", alt: true, action: "back" };
}

export function readerShortcuts(
  act: (action: ReaderAction) => void,
  direction: () => ReadingDirection,
  platform: Platform,
  mode: ReadingMode,
): Shortcut[] {
  const isStrip = mode === "longStrip";
  return [
    ...READER_KEYS,
    ...(isStrip ? STRIP_KEYS : []),
    backKey(platform),
  ].map(({ action, isCommand = false, ...keys }) => ({
    ...keys,
    ...(isCommand ? { command: platform } : {}),
    run: () => {
      act(
        !isStrip && ARROWS.has(keys.key) && isPageTurn(action)
          ? inReadingOrder(action, direction())
          : action,
      );
    },
  }));
}

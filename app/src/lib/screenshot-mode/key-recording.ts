import type { Platform } from "#lib/ipc/bindings.ts";
import { usesCommandKey } from "#lib/page/platform.ts";

import type { KeyCombination } from "./key-combination";

export type PressedKeys = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>;

export type RecordedPress =
  | { readonly kind: "passedOn" }
  | { readonly kind: "unusable" }
  | { readonly kind: "combination"; readonly combination: KeyCombination };

export type TakenUse =
  | "quickOpen"
  | "search"
  | "undo"
  | "selectAll"
  | "sidebar"
  | "editing"
  | "macos";

interface TakenCombination {
  readonly letter: string;
  readonly shift?: boolean;
  readonly use: TakenUse;
  readonly onlyOn?: Platform;
}

const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "Control",
  "Shift",
  "Alt",
  "AltGraph",
  "Meta",
]);
const FOCUS_AND_CLOSE_KEYS: ReadonlySet<string> = new Set(["Tab", "Escape"]);
const LATIN_LETTER = /^[a-z]$/i;
const LETTER_KEY_CODE = /^Key([A-Z])$/;

const TAKEN: readonly TakenCombination[] = [
  { letter: "K", shift: false, use: "quickOpen" },
  { letter: "F", shift: false, use: "search" },
  { letter: "Z", shift: false, use: "undo" },
  { letter: "Z", shift: true, use: "editing" },
  { letter: "A", use: "selectAll" },
  { letter: "B", shift: false, use: "sidebar" },
  { letter: "C", use: "editing" },
  { letter: "X", use: "editing" },
  { letter: "V", use: "editing" },
  { letter: "Y", shift: false, use: "editing", onlyOn: "windows" },
  { letter: "Q", use: "macos", onlyOn: "macos" },
  { letter: "W", shift: false, use: "macos", onlyOn: "macos" },
  { letter: "H", shift: false, use: "macos", onlyOn: "macos" },
  { letter: "M", shift: false, use: "macos", onlyOn: "macos" },
];

function isPassedOn({ key, ctrlKey, metaKey, altKey }: PressedKeys): boolean {
  return (
    MODIFIER_KEYS.has(key) ||
    (FOCUS_AND_CLOSE_KEYS.has(key) && !ctrlKey && !metaKey && !altKey)
  );
}

function isOnlyCommandHeld(
  { ctrlKey, metaKey, altKey }: PressedKeys,
  platform: Platform,
): boolean {
  const isCommandHeld = usesCommandKey(platform)
    ? metaKey && !ctrlKey
    : ctrlKey && !metaKey;
  return isCommandHeld && !altKey;
}

function letterOf({ key, code }: PressedKeys): string | undefined {
  if (LATIN_LETTER.test(key)) {
    return key.toUpperCase();
  }
  return LETTER_KEY_CODE.exec(code)?.[1];
}

export function recordPress(
  pressed: PressedKeys,
  platform: Platform,
): RecordedPress {
  if (isPassedOn(pressed)) {
    return { kind: "passedOn" };
  }
  const letter = letterOf(pressed);
  return letter !== undefined && isOnlyCommandHeld(pressed, platform)
    ? { kind: "combination", combination: { letter, shift: pressed.shiftKey } }
    : { kind: "unusable" };
}

export function takenUse(
  { letter, shift }: KeyCombination,
  platform: Platform,
): TakenUse | undefined {
  return TAKEN.find(
    (taken) =>
      taken.letter === letter &&
      (taken.shift === undefined || taken.shift === shift) &&
      (taken.onlyOn === undefined || taken.onlyOn === platform),
  )?.use;
}

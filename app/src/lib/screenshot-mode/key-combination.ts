import type { Platform } from "#lib/ipc/bindings.ts";
import { usesCommandKey } from "#lib/page/platform.ts";
import { m } from "#lib/paraglide/messages.js";

export interface KeyCombination {
  readonly letter: string;
  readonly shift: boolean;
}

export const DEFAULT_SCREENSHOT_SHORTCUT: KeyCombination = {
  letter: "H",
  shift: true,
};

const CAPITAL_LETTER = /^[A-Z]$/;

export function isCapitalLetter(text: string): boolean {
  return CAPITAL_LETTER.test(text);
}

export function keyNames(
  { letter, shift }: KeyCombination,
  platform: Platform,
): readonly string[] {
  const command = usesCommandKey(platform)
    ? m.shortcut_key_command()
    : m.shortcut_key_control();
  return shift ? [command, m.shortcut_key_shift(), letter] : [command, letter];
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

export function parseKeyCombination(stored: string | null): KeyCombination {
  const value = stored === null ? undefined : parseJson(stored);
  if (!isRecord(value)) {
    return DEFAULT_SCREENSHOT_SHORTCUT;
  }
  const { letter, shift } = value;
  return typeof letter === "string" &&
    isCapitalLetter(letter) &&
    typeof shift === "boolean"
    ? { letter, shift }
    : DEFAULT_SCREENSHOT_SHORTCUT;
}

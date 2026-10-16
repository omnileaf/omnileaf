import { createContext } from "svelte";

import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

export const UNDO_SETTING_KEY = "omnileaf.undo";

export const UNDO_WINDOWS_SECONDS = [5, 10, 20, 30] as const;

export type UndoWindowSeconds = (typeof UNDO_WINDOWS_SECONDS)[number];

export interface UndoRules {
  readonly isOffered: boolean;
  readonly windowSeconds: UndoWindowSeconds;
  readonly holdsWhileHoveredOrFocused: boolean;
}

export const NEW_UNDO_RULES: UndoRules = {
  isOffered: true,
  windowSeconds: 10,
  holdsWhileHoveredOrFocused: true,
};

function isWindow(value: unknown): value is UndoWindowSeconds {
  return UNDO_WINDOWS_SECONDS.some((seconds) => seconds === value);
}

function storedRules(stored: string | null): UndoRules {
  if (stored === null) {
    return NEW_UNDO_RULES;
  }
  try {
    const read: unknown = JSON.parse(stored);
    if (typeof read !== "object" || read === null) {
      return NEW_UNDO_RULES;
    }
    const { isOffered, windowSeconds, holdsWhileHoveredOrFocused } =
      read as Record<string, unknown>;
    return typeof isOffered === "boolean" &&
      isWindow(windowSeconds) &&
      typeof holdsWhileHoveredOrFocused === "boolean"
      ? { isOffered, windowSeconds, holdsWhileHoveredOrFocused }
      : NEW_UNDO_RULES;
  } catch {
    return NEW_UNDO_RULES;
  }
}

/** How the app offers Undo, kept on this device, as Settings › Advanced chooses it. */
export class UndoSetting {
  rules: UndoRules = $state(NEW_UNDO_RULES);

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, UNDO_SETTING_KEY);
    this.rules = storedRules(this.#stored.read());
  }

  choose(change: Partial<UndoRules>): void {
    this.rules = { ...this.rules, ...change };
    this.#stored.writeIfPossible(JSON.stringify(this.rules));
  }
}

export function undoSettingForDocument(): UndoSetting {
  return new UndoSetting(browserPreferenceStore());
}

export const [getUndoSetting, setUndoSetting] = createContext<UndoSetting>();

import { createContext } from "svelte";

import type { Platform } from "#lib/ipc/bindings.ts";
import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";
import type { Shortcut } from "#lib/shortcut.ts";

import {
  DEFAULT_SCREENSHOT_SHORTCUT,
  type KeyCombination,
  parseKeyCombination,
} from "./key-combination";

const PREFERENCE_KEY = "omnileaf.screenshotModeShortcut";

export class ScreenshotModeShortcut {
  combination: KeyCombination = $state.raw(DEFAULT_SCREENSHOT_SHORTCUT);

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, PREFERENCE_KEY);
    this.combination = parseKeyCombination(this.#stored.read());
  }

  choose(combination: KeyCombination): void {
    this.combination = combination;
    this.#stored.writeIfPossible(JSON.stringify(combination));
  }

  shortcut(platform: Platform, run: () => void): Shortcut {
    return {
      key: this.combination.letter.toLowerCase(),
      command: platform,
      shift: this.combination.shift,
      inTextFields: true,
      ignoresRepeats: true,
      run,
    };
  }
}

export function screenshotModeShortcutForDocument(): ScreenshotModeShortcut {
  return new ScreenshotModeShortcut(browserPreferenceStore());
}

export const [getScreenshotModeShortcut, setScreenshotModeShortcut] =
  createContext<ScreenshotModeShortcut>();

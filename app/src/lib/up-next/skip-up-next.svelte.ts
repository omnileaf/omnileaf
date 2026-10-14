import { createContext } from "svelte";

import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const PREFERENCE_KEY = "omnileaf.skipUpNext";
const STORED_ON = "on";
const STORED_OFF = "off";

/** Whether turning past a book's last page opens the next straight away rather than showing what's up next. */
export class SkipUpNextSetting {
  isOn = $state(false);

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, PREFERENCE_KEY);
    this.isOn = this.#stored.read() === STORED_ON;
  }

  turn(isOn: boolean): void {
    this.isOn = isOn;
    this.#stored.writeIfPossible(isOn ? STORED_ON : STORED_OFF);
  }
}

export function skipUpNextSettingForDocument(): SkipUpNextSetting {
  return new SkipUpNextSetting(browserPreferenceStore());
}

export const [getSkipUpNextSetting, setSkipUpNextSetting] =
  createContext<SkipUpNextSetting>();

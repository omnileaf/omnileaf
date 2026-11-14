import { createContext } from "svelte";

import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const PREFERENCE_KEY = "omnileaf.tapOpenTab";
const STORED_ON = "on";
const STORED_OFF = "off";

export class TapOpenTabSetting {
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

export function tapOpenTabSettingForDocument(): TapOpenTabSetting {
  return new TapOpenTabSetting(browserPreferenceStore());
}

export const [getTapOpenTabSetting, setTapOpenTabSetting] =
  createContext<TapOpenTabSetting>();

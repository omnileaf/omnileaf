import { createContext } from "svelte";

import {
  browserPreferenceStore,
  type PreferenceStore,
} from "#lib/preferences/stored-preference.ts";
import { StoredSwitch } from "#lib/preferences/stored-switch.ts";

const PREFERENCE_KEY = "omnileaf.tapOpenTab";
const IS_ON_UNTIL_TURNED_OFF = true;

export class TapOpenTabSetting {
  isOn = $state(IS_ON_UNTIL_TURNED_OFF);

  readonly #stored: StoredSwitch;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredSwitch(store, PREFERENCE_KEY);
    this.isOn = this.#stored.read() ?? IS_ON_UNTIL_TURNED_OFF;
  }

  turn(isOn: boolean): void {
    this.isOn = isOn;
    this.#stored.writeIfPossible(isOn);
  }
}

export function tapOpenTabSettingForDocument(): TapOpenTabSetting {
  return new TapOpenTabSetting(browserPreferenceStore());
}

export const [getTapOpenTabSetting, setTapOpenTabSetting] =
  createContext<TapOpenTabSetting>();

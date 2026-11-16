import {
  type ForgettingPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "./stored-preference.ts";

const STORED_ON = "on";
const STORED_OFF = "off";

export class StoredSwitch<Store extends PreferenceStore = PreferenceStore> {
  readonly #stored: StoredPreference<Store>;

  constructor(store: Store | undefined, key: string) {
    this.#stored = new StoredPreference(store, key);
  }

  read(): boolean | undefined {
    const stored = this.#stored.read();
    if (stored === STORED_ON) {
      return true;
    }
    return stored === STORED_OFF ? false : undefined;
  }

  writeIfPossible(isOn: boolean): void {
    this.#stored.writeIfPossible(isOn ? STORED_ON : STORED_OFF);
  }

  forgetIfPossible(this: StoredSwitch<ForgettingPreferenceStore>): void {
    this.#stored.forgetIfPossible();
  }
}

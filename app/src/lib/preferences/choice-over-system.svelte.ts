import type { ForgettingPreferenceStore } from "./stored-preference.ts";
import { StoredSwitch } from "./stored-switch.ts";

export class ChoiceOverSystem {
  #isSystemOn = $state(false);
  #chosen: boolean | undefined = $state();

  readonly #stored: StoredSwitch<ForgettingPreferenceStore>;

  constructor(store: ForgettingPreferenceStore | undefined, key: string) {
    this.#stored = new StoredSwitch(store, key);
    this.#chosen = this.#stored.read();
  }

  get isOn(): boolean {
    return this.#chosen ?? this.#isSystemOn;
  }

  followSystem(isSystemOn: boolean): void {
    this.#isSystemOn = isSystemOn;
    if (this.#chosen === isSystemOn) {
      this.#forgetChoice();
    }
  }

  choose(isOn: boolean): void {
    if (isOn === this.#isSystemOn) {
      this.#forgetChoice();
      return;
    }
    this.#chosen = isOn;
    this.#stored.writeIfPossible(isOn);
  }

  #forgetChoice(): void {
    this.#chosen = undefined;
    this.#stored.forgetIfPossible();
  }
}

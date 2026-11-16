import { followBoldText } from "#lib/page/display-modes.ts";
import {
  browserPreferenceStore,
  type ForgettingPreferenceStore,
} from "#lib/preferences/stored-preference.ts";
import { StoredSwitch } from "#lib/preferences/stored-switch.ts";

const BOLD_TEXT_KEY = "omnileaf.boldText";

export class BoldTextChoice {
  system = $state(false);
  #chosen: boolean | undefined = $state();

  readonly #stored: StoredSwitch<ForgettingPreferenceStore>;

  constructor(store: ForgettingPreferenceStore | undefined) {
    this.#stored = new StoredSwitch(store, BOLD_TEXT_KEY);
    this.#chosen = this.#stored.read();
  }

  get isBold(): boolean {
    return this.#chosen ?? this.system;
  }

  markDocument(): void {
    followBoldText(this.isBold);
  }

  followSystem(isSystemBold: boolean): void {
    this.system = isSystemBold;
    followBoldText(this.isBold);
  }

  choose(isBold: boolean): void {
    this.#chosen = isBold;
    this.#stored.writeIfPossible(isBold);
    followBoldText(isBold);
  }
}

export const boldTextChoice = new BoldTextChoice(browserPreferenceStore());

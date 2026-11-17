import { followBoldText } from "#lib/page/display-modes.ts";
import { ChoiceOverSystem } from "#lib/preferences/choice-over-system.svelte.ts";
import {
  browserPreferenceStore,
  type ForgettingPreferenceStore,
} from "#lib/preferences/stored-preference.ts";

const BOLD_TEXT_KEY = "omnileaf.boldText";

export class BoldTextChoice {
  readonly #choice: ChoiceOverSystem;

  constructor(store: ForgettingPreferenceStore | undefined) {
    this.#choice = new ChoiceOverSystem(store, BOLD_TEXT_KEY);
  }

  get isBold(): boolean {
    return this.#choice.isOn;
  }

  markDocument(): void {
    followBoldText(this.isBold);
  }

  followSystem(isSystemBold: boolean): void {
    this.#choice.followSystem(isSystemBold);
    followBoldText(this.isBold);
  }

  choose(isBold: boolean): void {
    this.#choice.choose(isBold);
    followBoldText(this.isBold);
  }
}

export const boldTextChoice = new BoldTextChoice(browserPreferenceStore());

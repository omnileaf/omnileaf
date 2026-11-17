import type { SystemContrast } from "#lib/ipc/bindings.ts";
import { ChoiceOverSystem } from "#lib/preferences/choice-over-system.svelte.ts";
import {
  browserPreferenceStore,
  type ForgettingPreferenceStore,
} from "#lib/preferences/stored-preference.ts";

import { type Contrast, followContrast } from "./display-modes";

const PREFERENCE_KEY = "omnileaf.higherContrast";

const DRAWN_CONTRAST = {
  standard: undefined,
  medium: "medium",
  high: "high",
} satisfies Record<SystemContrast, Contrast | undefined>;

export class ContrastChoice {
  #system: SystemContrast = $state("standard");

  readonly #choice: ChoiceOverSystem;

  constructor(store: ForgettingPreferenceStore | undefined) {
    this.#choice = new ChoiceOverSystem(store, PREFERENCE_KEY);
  }

  get isHigher(): boolean {
    return this.#choice.isOn;
  }

  get drawn(): Contrast | undefined {
    const { chosen } = this.#choice;
    if (chosen === undefined) {
      return DRAWN_CONTRAST[this.#system];
    }
    return chosen ? "high" : undefined;
  }

  followSystem(contrast: SystemContrast): void {
    this.#system = contrast;
    this.#choice.followSystem(contrast !== "standard");
    followContrast(this.drawn);
  }

  choose(isHigher: boolean): void {
    this.#choice.choose(isHigher);
    followContrast(this.drawn);
  }
}

export const contrastChoice = new ContrastChoice(browserPreferenceStore());

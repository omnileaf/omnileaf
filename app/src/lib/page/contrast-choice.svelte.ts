import type { SystemContrast } from "#lib/ipc/bindings.ts";
import {
  browserPreferenceStore,
  type PreferenceStore,
} from "#lib/preferences/stored-preference.ts";
import { StoredSwitch } from "#lib/preferences/stored-switch.ts";

import { type Contrast, followContrast } from "./display-modes";

const PREFERENCE_KEY = "omnileaf.higherContrast";

const DRAWN_CONTRAST = {
  standard: undefined,
  medium: "medium",
  high: "high",
} satisfies Record<SystemContrast, Contrast | undefined>;

export class ContrastChoice {
  system: SystemContrast = $state("standard");
  #chosen: boolean | undefined = $state();

  readonly #stored: StoredSwitch;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredSwitch(store, PREFERENCE_KEY);
    this.#chosen = this.#stored.read();
  }

  get isHigher(): boolean {
    return this.#chosen ?? this.system !== "standard";
  }

  get drawn(): Contrast | undefined {
    if (this.#chosen === undefined) {
      return DRAWN_CONTRAST[this.system];
    }
    return this.#chosen ? "high" : undefined;
  }

  followSystem(contrast: SystemContrast): void {
    this.system = contrast;
    followContrast(this.drawn);
  }

  choose(isHigher: boolean): void {
    this.#chosen = isHigher;
    this.#stored.writeIfPossible(isHigher);
    followContrast(this.drawn);
  }
}

export const contrastChoice = new ContrastChoice(browserPreferenceStore());

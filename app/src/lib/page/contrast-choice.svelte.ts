import type { SystemContrast } from "#lib/ipc/bindings.ts";
import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

import { type Contrast, followContrast } from "./display-modes";

const PREFERENCE_KEY = "omnileaf.higherContrast";
const STORED_ON = "on";
const STORED_OFF = "off";

const DRAWN_CONTRAST = {
  standard: undefined,
  medium: "medium",
  high: "high",
} satisfies Record<SystemContrast, Contrast | undefined>;

function choiceIn(stored: string | null): boolean | undefined {
  if (stored === STORED_ON) {
    return true;
  }
  return stored === STORED_OFF ? false : undefined;
}

export class ContrastChoice {
  system: SystemContrast = $state("standard");
  #chosen: boolean | undefined = $state();

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, PREFERENCE_KEY);
    this.#chosen = choiceIn(this.#stored.read());
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
    this.#stored.writeIfPossible(isHigher ? STORED_ON : STORED_OFF);
    followContrast(this.drawn);
  }
}

export const contrastChoice = new ContrastChoice(browserPreferenceStore());

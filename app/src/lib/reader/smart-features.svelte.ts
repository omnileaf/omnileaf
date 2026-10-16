import { createContext } from "svelte";

import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

export type SmartFeature =
  | "choosesReadingMode"
  | "learnsReadingSpeed"
  | "showsTimeLeft"
  | "showsBookSummary"
  | "showsPagePreviews";

type Choices = Record<SmartFeature, boolean>;

const PREFERENCE_KEY = "omnileaf.smartFeatures";
const ALL_ON: Choices = {
  choosesReadingMode: true,
  learnsReadingSpeed: true,
  showsTimeLeft: true,
  showsBookSummary: true,
  showsPagePreviews: true,
};
const ALL_OFF: Choices = {
  choosesReadingMode: false,
  learnsReadingSpeed: false,
  showsTimeLeft: false,
  showsBookSummary: false,
  showsPagePreviews: false,
};

function storedChoices(stored: string | null): Choices {
  try {
    const parsed: unknown = JSON.parse(stored ?? "{}");
    if (typeof parsed !== "object" || parsed === null) {
      return ALL_ON;
    }
    const read = parsed as Record<string, unknown>;
    const choice = (feature: SmartFeature): boolean => {
      const value = read[feature];
      return typeof value === "boolean" ? value : ALL_ON[feature];
    };
    return {
      choosesReadingMode: choice("choosesReadingMode"),
      learnsReadingSpeed: choice("learnsReadingSpeed"),
      showsTimeLeft: choice("showsTimeLeft"),
      showsBookSummary: choice("showsBookSummary"),
      showsPagePreviews: choice("showsPagePreviews"),
    };
  } catch {
    return ALL_ON;
  }
}

/** The reader's features that work from how this device reads, each on until turned off. */
export class SmartFeatures {
  #choices: Choices = $state(ALL_ON);

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, PREFERENCE_KEY);
    this.#choices = storedChoices(this.#stored.read());
  }

  get choosesReadingMode(): boolean {
    return this.#choices.choosesReadingMode;
  }

  get learnsReadingSpeed(): boolean {
    return this.#choices.learnsReadingSpeed;
  }

  get showsTimeLeft(): boolean {
    return this.#choices.learnsReadingSpeed && this.#choices.showsTimeLeft;
  }

  get showsBookSummary(): boolean {
    return this.#choices.showsBookSummary;
  }

  get showsPagePreviews(): boolean {
    return this.#choices.showsPagePreviews;
  }

  turn(feature: SmartFeature, isOn: boolean): void {
    this.#keep({ ...this.#choices, [feature]: isOn });
  }

  turnAllOff(): void {
    this.#keep(ALL_OFF);
  }

  #keep(choices: Choices): void {
    this.#choices = choices;
    this.#stored.writeIfPossible(JSON.stringify(choices));
  }
}

export function smartFeaturesForDocument(): SmartFeatures {
  return new SmartFeatures(browserPreferenceStore());
}

export const [getSmartFeatures, setSmartFeatures] =
  createContext<SmartFeatures>();

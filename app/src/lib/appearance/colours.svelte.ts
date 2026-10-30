import { createContext } from "svelte";

import {
  browserStorage,
  type PreferenceStore,
  readPreference,
  rememberPreference,
} from "#lib/preferences/preference-store.ts";

const PREFERENCE_KEY = "omnileaf.colours";

export const COLOURS_CHOICES = ["omnileaf", "wallpaper"] as const;

export type ColoursChoice = (typeof COLOURS_CHOICES)[number];

function parseColoursChoice(stored: string | null): ColoursChoice {
  return COLOURS_CHOICES.find((choice) => choice === stored) ?? "omnileaf";
}

export class ColoursSetting {
  choice: ColoursChoice = $state("omnileaf");

  readonly #store: PreferenceStore | undefined;

  constructor(store: PreferenceStore | undefined) {
    this.#store = store;
    this.choice = parseColoursChoice(readPreference(store, PREFERENCE_KEY));
  }

  choose(choice: ColoursChoice): void {
    this.choice = choice;
    rememberPreference(this.#store, PREFERENCE_KEY, choice);
  }
}

export function coloursSettingForDocument(): ColoursSetting {
  return new ColoursSetting(browserStorage());
}

export const [getColoursSetting, setColoursSetting] =
  createContext<ColoursSetting>();

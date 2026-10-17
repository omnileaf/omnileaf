import { createContext } from "svelte";

import { resolve } from "$app/paths";
import { assertNever } from "#lib/assert-never.ts";
import { lastUnfinishedBookPage } from "#lib/history/last-book.ts";
import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

export const OPENS_ON_PREFERENCE_KEY = "omnileaf.opensOn";

export const OPENING_PLACES = ["library", "history", "lastBook"] as const;

export type OpeningPlace = (typeof OPENING_PLACES)[number];

function isOpeningPlace(stored: string | null): stored is OpeningPlace {
  return OPENING_PLACES.some((place) => place === stored);
}

/** Where Omnileaf opens when it starts: the library, History, or the last book, in the reader where it was left. */
export class OpensOnSetting {
  choice: OpeningPlace = $state("library");

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, OPENS_ON_PREFERENCE_KEY);
    const stored = this.#stored.read();
    this.choice = isOpeningPlace(stored) ? stored : "library";
  }

  choose(place: OpeningPlace): void {
    this.choice = place;
    this.#stored.writeIfPossible(place);
  }
}

export function opensOnSettingForDocument(): OpensOnSetting {
  return new OpensOnSetting(browserPreferenceStore());
}

export const [getOpensOnSetting, setOpensOnSetting] =
  createContext<OpensOnSetting>();

let hasOpened = false;

/** The page Omnileaf opens on when it starts, chosen once, so the library a person comes back to later stays where they asked. */
export async function openingPage(
  place: OpeningPlace,
): Promise<string | undefined> {
  if (hasOpened) {
    return undefined;
  }
  hasOpened = true;
  switch (place) {
    case "library":
      return undefined;
    case "history":
      return resolve("/(app)/history");
    case "lastBook":
      return lastUnfinishedBookPage();
    default:
      return assertNever(place);
  }
}

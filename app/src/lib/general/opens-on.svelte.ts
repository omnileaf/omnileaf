import { createContext } from "svelte";

import { resolve } from "$app/paths";
import { assertNever } from "#lib/assert-never.ts";
import { lastUnfinishedBookPage } from "#lib/history/last-book.ts";
import { takeRestoredRoute } from "#lib/navigation/restored-route.ts";
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

type FindPage = () => Promise<string | undefined>;

export interface OpeningPages {
  readonly restoredRoute: FindPage;
  readonly lastBook: FindPage;
}

export type OpeningPage = (place: OpeningPlace) => Promise<string | undefined>;

async function placePage(
  place: OpeningPlace,
  lastBook: FindPage,
): Promise<string | undefined> {
  switch (place) {
    case "library":
      return undefined;
    case "history":
      return resolve("/(app)/history");
    case "lastBook":
      return lastBook();
    default:
      return assertNever(place);
  }
}

export function openingPageOnce(pages: OpeningPages): OpeningPage {
  let hasOpened = false;
  return async (place) => {
    if (hasOpened) {
      return undefined;
    }
    hasOpened = true;
    const restored = await pages.restoredRoute();
    if (restored === undefined) {
      return placePage(place, pages.lastBook);
    }
    return restored === resolve("/(app)") ? undefined : restored;
  };
}

export const openingPage: OpeningPage = openingPageOnce({
  restoredRoute: takeRestoredRoute,
  lastBook: lastUnfinishedBookPage,
});

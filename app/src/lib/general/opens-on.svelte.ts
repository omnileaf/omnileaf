import { createContext } from "svelte";

import { resolve } from "$app/paths";
import type { ResolvedPathname } from "$app/types";
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

type FindPage = () => Promise<ResolvedPathname | undefined>;

export type Opening =
  | { readonly kind: "stays" }
  | { readonly kind: "opensOn"; readonly page: ResolvedPathname }
  | { readonly kind: "restores"; readonly page: ResolvedPathname };

export type OpeningPage = (
  place: OpeningPlace,
  restored: ResolvedPathname | undefined,
) => Promise<Opening>;

const STAYS: Opening = { kind: "stays" };

async function placePage(
  place: OpeningPlace,
  lastBook: FindPage,
): Promise<ResolvedPathname | undefined> {
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

export function openingPageOnce(lastBook: FindPage): OpeningPage {
  let hasOpened = false;
  return async (place, restored) => {
    if (hasOpened) {
      return STAYS;
    }
    hasOpened = true;
    if (restored === undefined) {
      const page = await placePage(place, lastBook);
      return page === undefined ? STAYS : { kind: "opensOn", page };
    }
    return restored === resolve("/(app)")
      ? STAYS
      : { kind: "restores", page: restored };
  };
}

export const openingPage: OpeningPage = openingPageOnce(lastUnfinishedBookPage);

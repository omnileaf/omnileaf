import type { LibraryCategory } from "#lib/ipc/bindings.ts";
import {
  browserPreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

export const ALL_SERIES = "all";
export const NEW_CHAPTERS = "new-chapters";
export const OPENS_ON_LAST_TAB = "last";
export const LIBRARY_TAB_KEY = "omnileaf.libraryTab";
export const LIBRARY_OPENS_ON_KEY = "omnileaf.libraryOpensOn";

const FEWEST_CATEGORIES_FOR_TABS = 2;

let hasOpened = false;

export function showsCategoryTabs(
  categories: readonly LibraryCategory[],
): boolean {
  return categories.length >= FEWEST_CATEGORIES_FOR_TABS;
}

/** The tab the library opens on when the app starts; New chapters opens on All, since a library without sources never has anything new. */
export function openingTab(
  opensOn: string | null,
  usedLast: string | null,
): string {
  const tab =
    opensOn === null || opensOn === OPENS_ON_LAST_TAB
      ? (usedLast ?? ALL_SERIES)
      : opensOn;
  return tab === NEW_CHAPTERS ? ALL_SERIES : tab;
}

/** The tab the library opens on: the one used last, or one chosen in Library tabs. */
export class LibraryOpensOn {
  readonly #stored = new StoredPreference(
    browserPreferenceStore(),
    LIBRARY_OPENS_ON_KEY,
  );
  choice = $state(OPENS_ON_LAST_TAB);

  constructor() {
    this.choice = this.#stored.read() ?? OPENS_ON_LAST_TAB;
  }

  choose(choice: string): void {
    this.choice = choice;
    this.#stored.writeIfPossible(choice);
  }
}

/** The tab chosen in the library, opening where Library tabs says once each time the app starts and keeping the one used after that. */
export class LibraryTab {
  readonly #stored = new StoredPreference(
    browserPreferenceStore(),
    LIBRARY_TAB_KEY,
  );
  #chosen = $state(ALL_SERIES);

  constructor() {
    const usedLast = this.#stored.read();
    if (hasOpened) {
      this.#chosen = usedLast ?? ALL_SERIES;
      return;
    }
    hasOpened = true;
    this.choose(openingTab(new LibraryOpensOn().choice, usedLast));
  }

  get chosen(): string {
    return this.#chosen;
  }

  choose(tab: string): void {
    this.#chosen = tab;
    this.#stored.writeIfPossible(tab);
  }
}

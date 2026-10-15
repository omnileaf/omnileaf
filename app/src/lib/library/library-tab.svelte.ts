import type { LibraryCategory } from "#lib/ipc/bindings.ts";
import {
  browserPreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

type CategoryId = LibraryCategory["id"];

export const ALL_SERIES = "all";
export const LIBRARY_TAB_KEY = "omnileaf.libraryTab";

const FEWEST_CATEGORIES_FOR_TABS = 2;

export function showsCategoryTabs(
  categories: readonly LibraryCategory[],
): boolean {
  return categories.length >= FEWEST_CATEGORIES_FOR_TABS;
}

export function categoryOf(
  tab: string,
  categories: readonly LibraryCategory[],
): CategoryId | undefined {
  return categories.find(({ id }) => id === tab)?.id;
}

export class LibraryTab {
  readonly #stored = new StoredPreference(
    browserPreferenceStore(),
    LIBRARY_TAB_KEY,
  );
  #chosen = $state(ALL_SERIES);

  constructor() {
    this.#chosen = this.#stored.read() ?? ALL_SERIES;
  }

  get chosen(): string {
    return this.#chosen;
  }

  choose(tab: string): void {
    this.#chosen = tab;
    this.#stored.writeIfPossible(tab);
  }
}

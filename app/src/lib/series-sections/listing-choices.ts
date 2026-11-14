import type { BookSection } from "#lib/ipc/bindings.ts";
import {
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";
import { isBooksShown, isSortDirection } from "#lib/series/book-listing.ts";

import type { ListingChange } from "./section-listing";

export const LISTING_CHOICES_KEY = "omnileaf.seriesListings";

const BOOK_SECTIONS: readonly BookSection[] = [
  "volumes",
  "chapters",
  "specials",
];

type StoredChoices = Readonly<Record<string, ListingChange>>;

function isBookSection(value: unknown): value is BookSection {
  return BOOK_SECTIONS.some((section) => section === value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readChange(value: unknown): ListingChange {
  if (!isRecord(value)) {
    return {};
  }
  const { direction, shown, section } = value;
  return {
    ...(typeof direction === "string" && isSortDirection(direction)
      ? { direction }
      : {}),
    ...(typeof shown === "string" && isBooksShown(shown) ? { shown } : {}),
    ...(isBookSection(section) ? { section } : {}),
  };
}

function parsed(text: string | null): unknown {
  if (text === null) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export class ListingChoices {
  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, LISTING_CHOICES_KEY);
  }

  of(series: string): ListingChange {
    return this.#all()[series] ?? {};
  }

  keep(series: string, change: ListingChange): void {
    const kept: StoredChoices = { ...this.#all(), [series]: change };
    this.#stored.writeIfPossible(JSON.stringify(kept));
  }

  #all(): StoredChoices {
    const all = parsed(this.#stored.read());
    return isRecord(all)
      ? Object.fromEntries(
          Object.entries(all).map(([series, change]) => [
            series,
            readChange(change),
          ]),
        )
      : {};
  }
}

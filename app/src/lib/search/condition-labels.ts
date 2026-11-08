import type { FilterCondition } from "#lib/library/library-listing.ts";
import { m } from "#lib/paraglide/messages.js";

import type { FilterWords } from "./typed-filters";

export const CONDITION_LABELS = {
  unread: m.library_filter_unread,
  started: m.library_filter_started,
  finished: m.library_filter_finished,
} as const satisfies Record<FilterCondition, () => string>;

export function filterWords(): FilterWords {
  return {
    unread: m.search_word_unread(),
    started: m.search_word_started(),
    finished: m.search_word_finished(),
  };
}

export const SOON_FILTERS = ["downloaded", "manga", "books", "adult"] as const;

export const SOON_FILTER_WORDS = {
  downloaded: m.search_word_downloaded,
  manga: m.search_word_manga,
  books: m.search_word_books,
  adult: m.search_word_adult,
} as const satisfies Record<(typeof SOON_FILTERS)[number], () => string>;

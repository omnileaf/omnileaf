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

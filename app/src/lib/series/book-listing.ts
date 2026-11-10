import type {
  BooksShown,
  SeriesBookListing,
  SortDirection,
} from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export type SortAndFilter = Pick<SeriesBookListing, "shown" | "direction">;

export type BookRows = "books" | "chapterRuns";

export type SearchPlace = "besideShown" | "inPlaceOfShown";

export const EVERY_BOOK_IN_ORDER: SortAndFilter = {
  shown: "all",
  direction: "ascending",
};

export const SHOWN_OPTIONS: readonly BooksShown[] = [
  "all",
  "unread",
  "bookmarked",
];

export const SHOWN_LABELS = {
  all: m.series_show_all,
  unread: m.series_show_unread,
  bookmarked: m.series_show_bookmarked,
} satisfies Record<BooksShown, () => string>;

export const DIRECTIONS: readonly SortDirection[] = ["ascending", "descending"];

export const ORDER_LABELS = {
  ascending: m.series_order_first_first,
  descending: m.series_order_last_first,
} satisfies Record<SortDirection, () => string>;

export const ORDERS = DIRECTIONS.map((direction) => ({
  direction,
  label: ORDER_LABELS[direction],
}));

export function isBooksShown(value: string): value is BooksShown {
  return SHOWN_OPTIONS.some((shown) => shown === value);
}

export function isSortDirection(value: string): value is SortDirection {
  return DIRECTIONS.some((direction) => direction === value);
}

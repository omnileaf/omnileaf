import {
  DEFAULT_LIBRARY_LISTING,
  type Inclusion,
  type LibraryFilter,
  type LibraryListing,
  type LibrarySortBy,
  type SortDirection,
} from "#lib/ipc/bindings.ts";

/** The reading-state conditions the library filters by, in the order the filter shows them. */
export type FilterCondition = keyof LibraryFilter;

export const FILTER_CONDITIONS: readonly FilterCondition[] = [
  "unread",
  "started",
  "finished",
];

export const INCLUSIONS: readonly Inclusion[] = ["any", "only", "hide"];

export const SORTS: readonly LibrarySortBy[] = ["title", "dateAdded"];

/** Titles read from A to Z, and the series added last are the ones looked for first. */
const NATURAL_DIRECTIONS = {
  title: "ascending",
  dateAdded: "descending",
} as const satisfies Record<LibrarySortBy, SortDirection>;

const OPPOSITE_DIRECTIONS = {
  ascending: "descending",
  descending: "ascending",
} as const satisfies Record<SortDirection, SortDirection>;

/** Takes the direction a sort reads most naturally in when it is newly chosen, and keeps the direction when it was chosen already. */
export function sortedBy(
  listing: LibraryListing,
  by: LibrarySortBy,
): LibraryListing {
  if (listing.sort.by === by) {
    return listing;
  }
  return { ...listing, sort: { by, direction: NATURAL_DIRECTIONS[by] } };
}

export function reversed(listing: LibraryListing): LibraryListing {
  const direction = OPPOSITE_DIRECTIONS[listing.sort.direction];
  return { ...listing, sort: { ...listing.sort, direction } };
}

export function filteredBy(
  listing: LibraryListing,
  condition: FilterCondition,
  inclusion: Inclusion,
): LibraryListing {
  return { ...listing, filter: { ...listing.filter, [condition]: inclusion } };
}

export function withoutFilters(listing: LibraryListing): LibraryListing {
  return { ...listing, filter: DEFAULT_LIBRARY_LISTING.filter };
}

/** How many conditions the filter holds a series to. */
export function filtersOn(filter: LibraryFilter): number {
  return FILTER_CONDITIONS.filter((condition) => filter[condition] !== "any")
    .length;
}

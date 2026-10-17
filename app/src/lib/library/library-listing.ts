import {
  DEFAULT_LIBRARY_LISTING,
  type Inclusion,
  type LibraryFilter,
  type LibraryFilterChoices,
  type LibraryListing,
  type LibrarySortBy,
  type SortDirection,
} from "#lib/ipc/bindings.ts";

/** The reading-state conditions the library filters by, in the order the filter shows them. */
export type FilterCondition = "unread" | "started" | "finished";

export const NO_FILTER_CHOICES: LibraryFilterChoices = {
  formats: [],
  languages: [],
  tags: [],
  ratesAdult: false,
  keepsBookmarks: false,
  smart: [],
};

export const NEW_LIBRARY_LISTING: LibraryListing = {
  sort: { ...DEFAULT_LIBRARY_LISTING.sort },
  filter: {
    ...DEFAULT_LIBRARY_LISTING.filter,
    formats: [],
    languages: [],
    tags: [],
    smart: [],
  },
};

export const FILTER_CONDITIONS: readonly FilterCondition[] = [
  "unread",
  "started",
  "finished",
];

export const INCLUSIONS: readonly Inclusion[] = ["any", "only", "hide"];

export const SORTS: readonly LibrarySortBy[] = [
  "title",
  "lastRead",
  "dateAdded",
];

/** Titles read from A to Z, and the series added or read last are the ones looked for first. */
const NATURAL_DIRECTIONS = {
  title: "ascending",
  dateAdded: "descending",
  lastRead: "descending",
} as const satisfies Record<LibrarySortBy, SortDirection>;

const OPPOSITE_DIRECTIONS = {
  ascending: "descending",
  descending: "ascending",
} as const satisfies Record<SortDirection, SortDirection>;

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
  return { ...listing, filter: NEW_LIBRARY_LISTING.filter };
}

export type ChosenFrom = "formats" | "languages" | "tags" | "smart";

export type IncludedBy = "adult" | "bookmarked";

export function toggledIn<Key extends ChosenFrom>(
  listing: LibraryListing,
  key: Key,
  value: LibraryFilter[Key][number],
): LibraryListing {
  const chosen: readonly string[] = listing.filter[key];
  const toggled = chosen.includes(value)
    ? chosen.filter((each) => each !== value)
    : [...chosen, value];
  return { ...listing, filter: { ...listing.filter, [key]: toggled } };
}

export function withInclusion(
  listing: LibraryListing,
  key: IncludedBy,
  inclusion: Inclusion,
): LibraryListing {
  return { ...listing, filter: { ...listing.filter, [key]: inclusion } };
}

function readFiltersOn(filter: LibraryFilter): number {
  if (readStateOf(filter) !== "any") {
    return 1;
  }
  return FILTER_CONDITIONS.filter((condition) => filter[condition] !== "any")
    .length;
}

export function filtersOn(filter: LibraryFilter): number {
  const included = [filter.adult, filter.bookmarked].filter(
    (inclusion) => inclusion !== "any",
  ).length;
  return (
    readFiltersOn(filter) +
    filter.formats.length +
    filter.languages.length +
    filter.tags.length +
    filter.smart.length +
    included
  );
}

export type ReadState = "any" | "unread" | "inProgress" | "read";

export const READ_STATES: readonly ReadState[] = [
  "any",
  "unread",
  "inProgress",
  "read",
];

const READ_STATE_FILTERS = {
  any: { unread: "any", started: "any", finished: "any" },
  unread: { unread: "any", started: "hide", finished: "any" },
  inProgress: { unread: "any", started: "only", finished: "hide" },
  read: { unread: "any", started: "any", finished: "only" },
} as const satisfies Record<ReadState, Pick<LibraryFilter, FilterCondition>>;

export function readStateOf(filter: LibraryFilter): ReadState {
  return (
    READ_STATES.find((state) =>
      FILTER_CONDITIONS.every(
        (condition) =>
          READ_STATE_FILTERS[state][condition] === filter[condition],
      ),
    ) ?? "any"
  );
}

export function withReadState(
  listing: LibraryListing,
  state: ReadState,
): LibraryListing {
  return {
    ...listing,
    filter: { ...listing.filter, ...READ_STATE_FILTERS[state] },
  };
}

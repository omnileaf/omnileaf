import { expect, test } from "vitest";

import {
  DEFAULT_LIBRARY_LISTING,
  type LibraryListing,
} from "#lib/ipc/bindings.ts";

import {
  filteredBy,
  filtersOn,
  reversed,
  sortedBy,
  readStateOf,
  withoutFilters,
  withReadState,
} from "./library-listing";

const NEWEST_UNREAD: LibraryListing = {
  sort: { by: "dateAdded", direction: "descending" },
  filter: { unread: "only", started: "any", finished: "hide" },
};

test("lists the newest series first once date added is chosen", () => {
  const listing = sortedBy(DEFAULT_LIBRARY_LISTING, "dateAdded");

  expect(listing.sort).toEqual({ by: "dateAdded", direction: "descending" });
});

test("lists titles from A to Z once title is chosen", () => {
  const listing = sortedBy(NEWEST_UNREAD, "title");

  expect(listing.sort).toEqual({ by: "title", direction: "ascending" });
});

test("keeps the direction when the sort chosen already is chosen again", () => {
  const oldestFirst = reversed(NEWEST_UNREAD);

  const listing = sortedBy(oldestFirst, "dateAdded");

  expect(listing.sort).toEqual({ by: "dateAdded", direction: "ascending" });
});

test("keeps the filter when the sort changes", () => {
  const listing = sortedBy(NEWEST_UNREAD, "title");

  expect(listing.filter).toEqual(NEWEST_UNREAD.filter);
});

test("reverses the direction of the sort either way", () => {
  const once = reversed(DEFAULT_LIBRARY_LISTING);
  const twice = reversed(once);

  expect([once.sort.direction, twice.sort.direction]).toEqual([
    "descending",
    "ascending",
  ]);
});

test("filters by one condition and leaves the others as they were", () => {
  const listing = filteredBy(NEWEST_UNREAD, "started", "only");

  expect(listing).toEqual({
    sort: NEWEST_UNREAD.sort,
    filter: { unread: "only", started: "only", finished: "hide" },
  });
});

test("clears every condition of the filter and keeps the sort", () => {
  const listing = withoutFilters(NEWEST_UNREAD);

  expect(listing).toEqual({
    sort: NEWEST_UNREAD.sort,
    filter: DEFAULT_LIBRARY_LISTING.filter,
  });
});

test("counts the conditions a series is held to", () => {
  const counts = [
    filtersOn(DEFAULT_LIBRARY_LISTING.filter),
    filtersOn(NEWEST_UNREAD.filter),
    filtersOn({ unread: "hide", started: "only", finished: "only" }),
  ];

  expect(counts).toEqual([0, 2, 3]);
});

test("names the read state a filter keeps, and any other mix as any", () => {
  const filters = [
    DEFAULT_LIBRARY_LISTING.filter,
    { unread: "any", started: "hide", finished: "any" },
    { unread: "any", started: "only", finished: "hide" },
    { unread: "any", started: "any", finished: "only" },
    { unread: "hide", started: "any", finished: "any" },
  ] as const;

  expect(filters.map((filter) => readStateOf(filter))).toEqual([
    "any",
    "unread",
    "inProgress",
    "read",
    "any",
  ]);
});

test("keeps only the series in the read state chosen, and the sort", () => {
  const listing = withReadState(DEFAULT_LIBRARY_LISTING, "inProgress");

  expect(listing).toEqual({
    ...DEFAULT_LIBRARY_LISTING,
    filter: { unread: "any", started: "only", finished: "hide" },
  });
  expect(readStateOf(withReadState(listing, "any").filter)).toBe("any");
});

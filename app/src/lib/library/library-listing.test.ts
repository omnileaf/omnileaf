import { expect, test } from "vitest";

import { type LibraryListing } from "#lib/ipc/bindings.ts";

import {
  filteredBy,
  filtersOn,
  reversed,
  sortedBy,
  readStateOf,
  toggledIn,
  withInclusion,
  withoutFilters,
  withReadState,
  NEW_LIBRARY_LISTING,
} from "./library-listing";

const NEWEST_UNREAD: LibraryListing = {
  sort: { by: "dateAdded", direction: "descending" },
  filter: {
    ...NEW_LIBRARY_LISTING.filter,
    unread: "only",
    started: "any",
    finished: "hide",
  },
};

test("lists the newest series first once date added is chosen", () => {
  const listing = sortedBy(NEW_LIBRARY_LISTING, "dateAdded");

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
  const once = reversed(NEW_LIBRARY_LISTING);
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
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "only",
      started: "only",
      finished: "hide",
    },
  });
});

test("clears every condition of the filter and keeps the sort", () => {
  const listing = withoutFilters(NEWEST_UNREAD);

  expect(listing).toEqual({
    sort: NEWEST_UNREAD.sort,
    filter: NEW_LIBRARY_LISTING.filter,
  });
});

test("counts the conditions a series is held to", () => {
  const counts = [
    filtersOn(NEW_LIBRARY_LISTING.filter),
    filtersOn(NEWEST_UNREAD.filter),
    filtersOn({
      ...NEW_LIBRARY_LISTING.filter,
      unread: "hide",
      started: "only",
      finished: "only",
    }),
  ];

  expect(counts).toEqual([0, 2, 3]);
});

test("names the read state a filter keeps, and any other mix as any", () => {
  const filters = [
    NEW_LIBRARY_LISTING.filter,
    {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "any",
      started: "hide",
      finished: "any",
    },
    {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "any",
      started: "only",
      finished: "hide",
    },
    {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "any",
      started: "any",
      finished: "only",
    },
    {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "hide",
      started: "any",
      finished: "any",
    },
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
  const listing = withReadState(NEW_LIBRARY_LISTING, "inProgress");

  expect(listing).toEqual({
    ...NEW_LIBRARY_LISTING,
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "any",
      started: "only",
      finished: "hide",
    },
  });
  expect(readStateOf(withReadState(listing, "any").filter)).toBe("any");
});

test("changes only the read state, keeping the formats, languages and tags chosen", () => {
  const japaneseManga: LibraryListing = {
    ...NEW_LIBRARY_LISTING,
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      formats: ["manga"],
      languages: ["ja"],
    },
  };

  const unread = withReadState(japaneseManga, "unread");

  expect(unread.filter).toEqual({
    ...japaneseManga.filter,
    started: "hide",
  });
});

test("clears every filter, formats, languages and tags included, and keeps the sort", () => {
  const narrowed: LibraryListing = {
    sort: { by: "dateAdded", direction: "descending" },
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      started: "hide",
      formats: ["comic"],
      languages: ["fr"],
      tags: ["Sea"],
      adult: "hide",
      bookmarked: "only",
    },
  };

  expect(withoutFilters(narrowed)).toEqual({
    sort: narrowed.sort,
    filter: NEW_LIBRARY_LISTING.filter,
  });
});

test("adds a format, language or tag on choosing it, and takes it off on choosing it again", () => {
  const manga = toggledIn(NEW_LIBRARY_LISTING, "formats", "manga");
  const mangaAndBooks = toggledIn(manga, "formats", "book");

  expect(mangaAndBooks.filter.formats).toEqual(["manga", "book"]);
  expect(toggledIn(mangaAndBooks, "formats", "manga").filter.formats).toEqual([
    "book",
  ]);
  expect(toggledIn(NEW_LIBRARY_LISTING, "tags", "Sea").filter.tags).toEqual([
    "Sea",
  ]);
});

test("sets 18+ and Bookmarked to any, only or hide", () => {
  const hidden = withInclusion(NEW_LIBRARY_LISTING, "adult", "hide");

  expect(withInclusion(hidden, "bookmarked", "only").filter).toEqual({
    ...NEW_LIBRARY_LISTING.filter,
    adult: "hide",
    bookmarked: "only",
  });
});

test("counts the read state, each format, language and tag, 18+ and Bookmarked as a filter each", () => {
  expect(
    filtersOn({
      ...NEW_LIBRARY_LISTING.filter,
      started: "hide",
      formats: ["manga"],
      languages: ["ja", "fr"],
      tags: ["Sea"],
      adult: "hide",
      bookmarked: "only",
    }),
  ).toBe(7);
});

import { expect, test } from "vitest";

import type { BookSection, SeriesBookListing } from "#lib/ipc/bindings.ts";

import {
  type SectionScreen,
  sectionListing,
  sectionTabs,
  sectionView,
  shownSection,
} from "./section-listing";

const LINUX_WINDOW: SectionScreen = { platform: "linux", isWide: true };
const NARROW_LINUX_WINDOW: SectionScreen = { platform: "linux", isWide: false };
const EVERY_SECTION: readonly BookSection[] = [
  "volumes",
  "chapters",
  "specials",
];
const IN_ORDER: SeriesBookListing = { shown: "all", direction: "ascending" };

test("gives linux a tab for each section of a series with more than one", () => {
  expect(sectionTabs(EVERY_SECTION, LINUX_WINDOW)).toEqual(EVERY_SECTION);
});

test("gives a series with one kind of book no tabs", () => {
  expect(sectionTabs(["volumes"], LINUX_WINDOW)).toEqual([]);
});

test.each<SectionScreen>([
  NARROW_LINUX_WINDOW,
  { platform: "macos", isWide: true },
  { platform: "windows", isWide: true },
  { platform: "ios", isWide: false },
  { platform: "android", isWide: true },
])(
  "keeps the books in one list on $platform when wide is $isWide",
  (screen) => {
    expect(sectionTabs(EVERY_SECTION, screen)).toEqual([]);
  },
);

test("lists the first section until another is chosen", () => {
  expect(sectionListing(IN_ORDER, EVERY_SECTION, LINUX_WINDOW)).toEqual({
    ...IN_ORDER,
    section: "volumes",
  });
});

test("lists the chosen section with the books shown as chosen", () => {
  const chosen: SeriesBookListing = {
    shown: "unread",
    direction: "descending",
    section: "chapters",
  };

  expect(sectionListing(chosen, EVERY_SECTION, LINUX_WINDOW)).toEqual(chosen);
});

test("lists every book of a section shown as covers", () => {
  const chosen: SeriesBookListing = {
    shown: "unread",
    direction: "ascending",
    section: "specials",
  };

  expect(sectionListing(chosen, EVERY_SECTION, LINUX_WINDOW)).toEqual({
    ...chosen,
    shown: "all",
  });
});

test("goes back to the first section when the chosen one is gone", () => {
  const chosen: SeriesBookListing = { ...IN_ORDER, section: "specials" };

  expect(sectionListing(chosen, ["volumes", "chapters"], LINUX_WINDOW)).toEqual(
    { ...IN_ORDER, section: "volumes" },
  );
});

test("lists every book of the series where no tabs show", () => {
  const chosen: SeriesBookListing = {
    shown: "unread",
    direction: "descending",
    section: "chapters",
  };

  expect(sectionListing(chosen, EVERY_SECTION, NARROW_LINUX_WINDOW)).toEqual({
    shown: "unread",
    direction: "descending",
  });
});

test("takes a series' only section as the one shown", () => {
  expect(shownSection(IN_ORDER, ["specials"])).toBe("specials");
});

test("shows no section for a series whose books have none or several unchosen", () => {
  expect([
    shownSection(IN_ORDER, []),
    shownSection(IN_ORDER, EVERY_SECTION),
  ]).toEqual([undefined, undefined]);
});

test.each<[BookSection, string]>([
  ["volumes", "covers"],
  ["chapters", "books"],
  ["specials", "covers"],
])("shows linux's %s as %s", (section, view) => {
  const listing = sectionListing(
    { ...IN_ORDER, section },
    EVERY_SECTION,
    LINUX_WINDOW,
  );

  expect(sectionView(listing, EVERY_SECTION, LINUX_WINDOW)).toBe(view);
});

test("shows a series of volumes only as covers on linux", () => {
  const listing = sectionListing(IN_ORDER, ["volumes"], LINUX_WINDOW);

  expect([listing, sectionView(listing, ["volumes"], LINUX_WINDOW)]).toEqual([
    IN_ORDER,
    "covers",
  ]);
});

test("keeps the books list for chapters only and for unsorted books", () => {
  expect([
    sectionView(IN_ORDER, ["chapters"], LINUX_WINDOW),
    sectionView(IN_ORDER, [], LINUX_WINDOW),
  ]).toEqual(["books", "books"]);
});

test("keeps the books list for volumes in a narrow window", () => {
  expect(sectionView(IN_ORDER, ["volumes"], NARROW_LINUX_WINDOW)).toBe("books");
});

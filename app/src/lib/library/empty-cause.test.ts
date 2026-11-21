import { expect, test } from "vitest";

import type { LibraryCategory } from "#lib/ipc/bindings.ts";

import { emptyCauseOf, type EmptyList, tabCountOf } from "./empty-cause.ts";
import type { ArrangedTab } from "./library-tabs.ts";

const ALL: ArrangedTab = { id: { kind: "all" }, name: "All", isHidden: false };
const NEW_CHAPTERS: ArrangedTab = {
  id: { kind: "newChapters" },
  name: "New chapters",
  isHidden: false,
};
const TEST: ArrangedTab = {
  id: { kind: "category", id: "test" as LibraryCategory["id"] },
  name: "Test",
  isHidden: false,
};
const EMPTY_TEST = { kind: "tab", tab: { kind: "category", name: "Test" } };
const NOTHING_NEW = { kind: "tab", tab: { kind: "newChapters" } };

const NOTHING_KNOWN: EmptyList = {
  listedTab: ALL,
  isFilterOn: false,
  isLibraryEmpty: false,
  listedTabCount: { kind: "counting" },
};

function filteredTest(listedTabCount: EmptyList["listedTabCount"]): EmptyList {
  return {
    ...NOTHING_KNOWN,
    listedTab: TEST,
    isFilterOn: true,
    listedTabCount,
  };
}

test("blames an empty library, whatever tab or filter is on", () => {
  const list = { ...filteredTest({ kind: "counting" }), isLibraryEmpty: true };

  expect(emptyCauseOf(list)).toEqual({ kind: "library" });
});

test("blames an empty library when All lists nothing with no filter on", () => {
  expect(emptyCauseOf(NOTHING_KNOWN)).toEqual({ kind: "library" });
});

test("blames an empty library when no tab is listed and no filter is on", () => {
  expect(emptyCauseOf({ ...NOTHING_KNOWN, listedTab: undefined })).toEqual({
    kind: "library",
  });
});

test("blames the filters when All lists nothing with a filter on", () => {
  expect(emptyCauseOf({ ...NOTHING_KNOWN, isFilterOn: true })).toEqual({
    kind: "filters",
  });
});

test("blames the filters when no tab is listed and a filter is on", () => {
  const list = { ...NOTHING_KNOWN, listedTab: undefined, isFilterOn: true };

  expect(emptyCauseOf(list)).toEqual({ kind: "filters" });
});

test("blames the category when it lists nothing with no filter on, whatever its count", () => {
  const unfiltered = { ...NOTHING_KNOWN, listedTab: TEST };

  expect([
    emptyCauseOf(unfiltered),
    emptyCauseOf({ ...unfiltered, listedTabCount: { kind: "failed" } }),
  ]).toEqual([EMPTY_TEST, EMPTY_TEST]);
});

test("blames neither the category nor the filters while the category's series are still being counted", () => {
  expect(emptyCauseOf(filteredTest({ kind: "counting" }))).toEqual({
    kind: "counting",
  });
});

test("blames the category when it holds nothing even without the filters on", () => {
  expect(emptyCauseOf(filteredTest({ kind: "counted", count: 0 }))).toEqual(
    EMPTY_TEST,
  );
});

test("blames the filters when a category holding series lists nothing", () => {
  expect(emptyCauseOf(filteredTest({ kind: "counted", count: 2 }))).toEqual({
    kind: "filters",
  });
});

test("blames the filters when the category could not be counted, so they can still be cleared", () => {
  expect(emptyCauseOf(filteredTest({ kind: "failed" }))).toEqual({
    kind: "filters",
  });
});

test("blames New chapters when it lists nothing with no filter on", () => {
  expect(emptyCauseOf({ ...NOTHING_KNOWN, listedTab: NEW_CHAPTERS })).toEqual(
    NOTHING_NEW,
  );
});

test("blames New chapters when it holds nothing even without the filters on", () => {
  const list = {
    ...filteredTest({ kind: "counted", count: 0 }),
    listedTab: NEW_CHAPTERS,
  };

  expect(emptyCauseOf(list)).toEqual(NOTHING_NEW);
});

test("reads a count as counted, still counting or failed", () => {
  expect([
    tabCountOf({ count: 3, hasFailed: false }),
    tabCountOf({ count: undefined, hasFailed: false }),
    tabCountOf({ count: undefined, hasFailed: true }),
  ]).toEqual([
    { kind: "counted", count: 3 },
    { kind: "counting" },
    { kind: "failed" },
  ]);
});

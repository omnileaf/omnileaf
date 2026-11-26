import { expect, test } from "vitest";

import type { LibraryCategory } from "#lib/ipc/bindings.ts";

import {
  actionOffered,
  type EmptyCause,
  emptyCauseOf,
  type EmptyList,
  keepsListChrome,
  narrowsLibrary,
} from "./empty-cause.ts";
import type { TabCount } from "./library-series-count.svelte.ts";
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
const EMPTY_TEST: EmptyCause = {
  kind: "tab",
  tab: { kind: "category", name: "Test" },
};
const NOTHING_NEW: EmptyCause = { kind: "tab", tab: { kind: "newChapters" } };

const NOTHING_KNOWN: EmptyList = {
  listedTab: ALL,
  isFilterOn: false,
  libraryCount: { kind: "counted", count: 6 },
  listedTabCount: { kind: "counting" },
};
const EMPTY_LIBRARY: TabCount = { kind: "counted", count: 0 };

function filteredTest(listedTabCount: EmptyList["listedTabCount"]): EmptyList {
  return {
    ...NOTHING_KNOWN,
    listedTab: TEST,
    isFilterOn: true,
    listedTabCount,
  };
}

test("blames an empty library, whatever tab or filter is on", () => {
  const lists = [
    { ...filteredTest({ kind: "counting" }), libraryCount: EMPTY_LIBRARY },
    { ...NOTHING_KNOWN, listedTab: TEST, libraryCount: EMPTY_LIBRARY },
    { ...NOTHING_KNOWN, isFilterOn: true, libraryCount: EMPTY_LIBRARY },
  ];

  expect(lists.map(emptyCauseOf)).toEqual([
    { kind: "library" },
    { kind: "library" },
    { kind: "library" },
  ]);
});

test("blames an empty library when All lists nothing with no filter on, without counting it", () => {
  const list: EmptyList = {
    ...NOTHING_KNOWN,
    libraryCount: { kind: "counting" },
  };

  expect(emptyCauseOf(list)).toEqual({ kind: "library" });
});

test("blames nothing while the library's series are still being counted under a tab or a filter", () => {
  const counting: TabCount = { kind: "counting" };
  const lists = [
    { ...NOTHING_KNOWN, listedTab: TEST, libraryCount: counting },
    { ...NOTHING_KNOWN, listedTab: NEW_CHAPTERS, libraryCount: counting },
    { ...NOTHING_KNOWN, isFilterOn: true, libraryCount: counting },
    { ...filteredTest({ kind: "counted", count: 2 }), libraryCount: counting },
  ];

  expect(lists.map(emptyCauseOf)).toEqual([
    { kind: "counting" },
    { kind: "counting" },
    { kind: "counting" },
    { kind: "counting" },
  ]);
});

test("blames the tab or the filters when the library could not be counted", () => {
  const failed: TabCount = { kind: "failed" };

  expect([
    emptyCauseOf({ ...NOTHING_KNOWN, listedTab: TEST, libraryCount: failed }),
    emptyCauseOf({ ...NOTHING_KNOWN, isFilterOn: true, libraryCount: failed }),
  ]).toEqual([EMPTY_TEST, { kind: "filters" }]);
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

test("narrows the library on a category or New chapters, or with a filter on", () => {
  expect([
    narrowsLibrary({ listedTab: ALL, isFilterOn: false }),
    narrowsLibrary({ listedTab: undefined, isFilterOn: false }),
    narrowsLibrary({ listedTab: ALL, isFilterOn: true }),
    narrowsLibrary({ listedTab: undefined, isFilterOn: true }),
    narrowsLibrary({ listedTab: TEST, isFilterOn: false }),
    narrowsLibrary({ listedTab: NEW_CHAPTERS, isFilterOn: false }),
  ]).toEqual([false, false, true, true, true, true]);
});

test("keeps the tabs and filters on screen for every empty state but an empty library's", () => {
  const causes: EmptyCause[] = [
    { kind: "library" },
    { kind: "tab", tab: { kind: "category", name: "Test" } },
    { kind: "filters" },
    { kind: "counting" },
  ];

  expect(causes.map(keepsListChrome)).toEqual([false, true, true, true]);
});

test("offers each empty state's own action", () => {
  expect([
    actionOffered({ kind: "library" }, undefined),
    actionOffered(EMPTY_TEST, undefined),
    actionOffered(NOTHING_NEW, undefined),
    actionOffered({ kind: "filters" }, undefined),
  ]).toEqual(["addFolder", "addSeries", undefined, "clearFilters"]);
});

test("offers no action once the list shows series", () => {
  expect(actionOffered(undefined, "clearFilters")).toBeUndefined();
});

test("keeps the action offered before while still counting", () => {
  expect([
    actionOffered({ kind: "counting" }, "addSeries"),
    actionOffered({ kind: "counting" }, undefined),
  ]).toEqual(["addSeries", undefined]);
});

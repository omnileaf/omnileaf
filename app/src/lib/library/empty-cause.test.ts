import { expect, test } from "vitest";

import type { LibraryCategory } from "#lib/ipc/bindings.ts";

import { emptyCause, type EmptyList } from "./empty-cause.ts";
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
  listedTabCount: undefined,
};

test("blames an empty library, whatever tab or filter is on", () => {
  const list = {
    ...NOTHING_KNOWN,
    listedTab: TEST,
    isFilterOn: true,
    isLibraryEmpty: true,
  };

  expect(emptyCause(list)).toEqual({ kind: "library" });
});

test("blames an empty library when All lists nothing with no filter on", () => {
  expect(emptyCause(NOTHING_KNOWN)).toEqual({ kind: "library" });
});

test("blames an empty library when no tab is listed and no filter is on", () => {
  expect(emptyCause({ ...NOTHING_KNOWN, listedTab: undefined })).toEqual({
    kind: "library",
  });
});

test("blames the filters when All lists nothing with a filter on", () => {
  expect(emptyCause({ ...NOTHING_KNOWN, isFilterOn: true })).toEqual({
    kind: "filters",
  });
});

test("blames the filters when no tab is listed and a filter is on", () => {
  const list = { ...NOTHING_KNOWN, listedTab: undefined, isFilterOn: true };

  expect(emptyCause(list)).toEqual({ kind: "filters" });
});

test("blames the category when it lists nothing with no filter on", () => {
  expect(emptyCause({ ...NOTHING_KNOWN, listedTab: TEST })).toEqual(EMPTY_TEST);
});

test("blames neither the category nor the filters while the category's series are still being counted", () => {
  const list = { ...NOTHING_KNOWN, listedTab: TEST, isFilterOn: true };

  expect(emptyCause(list)).toEqual({ kind: "counting" });
});

test("blames the category when it holds nothing even without the filters on", () => {
  const list = {
    ...NOTHING_KNOWN,
    listedTab: TEST,
    isFilterOn: true,
    listedTabCount: 0,
  };

  expect(emptyCause(list)).toEqual(EMPTY_TEST);
});

test("blames the filters when a category holding series lists nothing", () => {
  const list = {
    ...NOTHING_KNOWN,
    listedTab: TEST,
    isFilterOn: true,
    listedTabCount: 2,
  };

  expect(emptyCause(list)).toEqual({ kind: "filters" });
});

test("blames New chapters when it lists nothing with no filter on", () => {
  expect(emptyCause({ ...NOTHING_KNOWN, listedTab: NEW_CHAPTERS })).toEqual(
    NOTHING_NEW,
  );
});

test("blames New chapters when it holds nothing even without the filters on", () => {
  const list = {
    ...NOTHING_KNOWN,
    listedTab: NEW_CHAPTERS,
    isFilterOn: true,
    listedTabCount: 0,
  };

  expect(emptyCause(list)).toEqual(NOTHING_NEW);
});

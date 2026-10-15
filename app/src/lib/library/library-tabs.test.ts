import { expect, test } from "vitest";

import type { LibraryCategory, LibraryTab } from "#lib/ipc/bindings.ts";

import {
  arrangedTabs,
  NEW_LIBRARY_TABS,
  showsTabs,
  tabKey,
} from "./library-tabs.ts";

function category(id: string, name: string): LibraryCategory {
  return { id: id as LibraryCategory["id"], name };
}

const READING = category("reading", "Reading");
const MANGA = category("manga", "Manga");

function categoryTab({ id }: LibraryCategory, isHidden = false): LibraryTab {
  return { id: { kind: "category", id }, isHidden };
}

test("puts each category after the tabs a new library has, in the order they're kept", () => {
  const arranged = arrangedTabs(NEW_LIBRARY_TABS, [READING, MANGA]);

  expect(arranged.map(({ name }) => name)).toEqual([
    "All",
    "New chapters",
    "Reading",
    "Manga",
  ]);
});

test("follows the order the tabs were set in, hidden ones included", () => {
  const tabs: LibraryTab[] = [
    categoryTab(MANGA, true),
    { id: { kind: "all" }, isHidden: false },
    categoryTab(READING),
    { id: { kind: "newChapters" }, isHidden: true },
  ];

  const arranged = arrangedTabs(tabs, [READING, MANGA]);

  expect(arranged.map(({ name, isHidden }) => [name, isHidden])).toEqual([
    ["Manga", true],
    ["All", false],
    ["Reading", false],
    ["New chapters", true],
  ]);
});

test("leaves out a tab whose category has gone, and adds a new category at the end", () => {
  const tabs: LibraryTab[] = [...NEW_LIBRARY_TABS, categoryTab(READING)];

  const arranged = arrangedTabs(tabs, [MANGA]);

  expect(arranged.map(({ name }) => name)).toEqual([
    "All",
    "New chapters",
    "Manga",
  ]);
});

test("keys each tab as the library remembers the one chosen", () => {
  const keys = arrangedTabs(NEW_LIBRARY_TABS, [READING]).map(({ id }) =>
    tabKey(id),
  );

  expect(keys).toEqual(["all", "new-chapters", "reading"]);
});

test("shows the tabs once two sit beside All", () => {
  const shown = (categories: readonly LibraryCategory[]) =>
    arrangedTabs(NEW_LIBRARY_TABS, categories).filter(
      ({ isHidden }) => !isHidden,
    );

  expect([
    showsTabs(shown([READING])),
    showsTabs(shown([READING, MANGA])),
  ]).toEqual([false, true]);
});

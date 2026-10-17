import { expect, test } from "vitest";

import type { LibraryCategory } from "#lib/ipc/bindings.ts";

import {
  ALL_SERIES,
  NEW_CHAPTERS,
  OPENS_ON_LAST_TAB,
  openingTab,
  showsCategoryTabs,
} from "./library-tab.svelte.ts";

const MANGA = { id: "manga", name: "Manga" } as LibraryCategory;
const COMICS = { id: "comics", name: "Comics" } as LibraryCategory;

test("shows category tabs only once there are two categories or more", () => {
  expect([
    showsCategoryTabs([]),
    showsCategoryTabs([MANGA]),
    showsCategoryTabs([MANGA, COMICS]),
  ]).toEqual([false, false, true]);
});

test("opens on the tab used last until another is chosen, and on All the first time", () => {
  expect([
    openingTab(null, "manga"),
    openingTab(OPENS_ON_LAST_TAB, "manga"),
    openingTab(OPENS_ON_LAST_TAB, null),
  ]).toEqual(["manga", "manga", ALL_SERIES]);
});

test("opens on the tab chosen to open on, whichever was used last", () => {
  expect([
    openingTab(ALL_SERIES, "manga"),
    openingTab("comics", "manga"),
  ]).toEqual([ALL_SERIES, "comics"]);
});

test("opens on All rather than New chapters, where nothing is new", () => {
  expect([
    openingTab(NEW_CHAPTERS, "manga"),
    openingTab(OPENS_ON_LAST_TAB, NEW_CHAPTERS),
  ]).toEqual([ALL_SERIES, ALL_SERIES]);
});

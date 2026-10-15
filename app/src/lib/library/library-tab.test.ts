import { expect, test } from "vitest";

import type { LibraryCategory } from "#lib/ipc/bindings.ts";

import {
  ALL_SERIES,
  categoryOf,
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

test("lists a kept category's series, and every series for All or a category gone", () => {
  expect([
    categoryOf("comics", [MANGA, COMICS]),
    categoryOf(ALL_SERIES, [MANGA, COMICS]),
    categoryOf("removed", [MANGA, COMICS]),
  ]).toEqual(["comics", undefined, undefined]);
});

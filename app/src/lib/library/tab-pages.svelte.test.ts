import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test, vi } from "vitest";

import type { LibraryCategory, LibraryTabId } from "#lib/ipc/bindings.ts";

import { NEW_LIBRARY_LISTING } from "./library-listing";
import { TabPages } from "./tab-pages.svelte";

type CategoryId = LibraryCategory["id"];

const ALL: LibraryTabId = { kind: "all" };
const MANGA: LibraryTabId = { kind: "category", id: "manga" as CategoryId };
const COMICS: LibraryTabId = { kind: "category", id: "comics" as CategoryId };
const NOVELS: LibraryTabId = { kind: "category", id: "novels" as CategoryId };
const TABS = [ALL, MANGA, COMICS, NOVELS];

interface Asked {
  readonly command: string;
  readonly category: unknown;
}

function pagesAsked(): { asked: Asked[]; pages: TabPages } {
  const asked: Asked[] = [];
  mockIPC((command, args) => {
    asked.push({
      command,
      category:
        typeof args === "object" && "category" in args
          ? args.category
          : undefined,
    });
    return command.endsWith("_count") ? 3 : { series: [], next: null };
  });
  const pages = new TabPages(
    () => NEW_LIBRARY_LISTING,
    () => undefined,
  );
  return { asked, pages };
}

function tabsListed(asked: readonly Asked[]): unknown[] {
  return asked
    .filter(({ command }) => command.endsWith("_series"))
    .map(({ category }) => category);
}

function tabsCounted(asked: readonly Asked[]): unknown[] {
  return asked
    .filter(({ command }) => command.endsWith("_series_count"))
    .map(({ category }) => category);
}

afterEach(() => {
  clearMocks();
});

test("lists the first page of the chosen tab and of the tabs either side of it", async () => {
  const { asked, pages } = pagesAsked();

  pages.show({
    basis: NEW_LIBRARY_LISTING,
    tabs: TABS,
    chosen: MANGA,
    reach: 1,
  });
  await Promise.all(
    [ALL, MANGA, COMICS].map((tab) => pages.of(tab).series.load()),
  );

  expect(new Set(tabsListed(asked))).toEqual(
    new Set([undefined, "manga", "comics"]),
  );
});

test("counts the tabs either side of the chosen one, leaving the chosen tab's count to whoever shows it", async () => {
  const { asked, pages } = pagesAsked();

  pages.show({
    basis: NEW_LIBRARY_LISTING,
    tabs: TABS,
    chosen: MANGA,
    reach: 1,
  });
  await Promise.resolve();

  expect(new Set(tabsCounted(asked))).toEqual(new Set([undefined, "comics"]));
});

test("holds no page for a tab two or more away from the chosen one", async () => {
  const { asked, pages } = pagesAsked();

  pages.show({ basis: NEW_LIBRARY_LISTING, tabs: TABS, chosen: ALL, reach: 1 });
  await Promise.resolve();

  expect(tabsListed(asked)).not.toContain("comics");
  expect(tabsListed(asked)).not.toContain("novels");
});

test("keeps a page it holds when the chosen tab moves beside it, without reading it again", async () => {
  const { asked, pages } = pagesAsked();
  pages.show({ basis: NEW_LIBRARY_LISTING, tabs: TABS, chosen: ALL, reach: 1 });
  await Promise.resolve();
  const manga = pages.of(MANGA);
  asked.length = 0;

  pages.show({
    basis: NEW_LIBRARY_LISTING,
    tabs: TABS,
    chosen: MANGA,
    reach: 1,
  });
  await Promise.resolve();

  expect(pages.of(MANGA)).toBe(manga);
  expect(tabsListed(asked)).toEqual(["comics"]);
});

test("reads every held page again once the listing changes", async () => {
  const { asked, pages } = pagesAsked();
  pages.show({
    basis: NEW_LIBRARY_LISTING,
    tabs: TABS,
    chosen: MANGA,
    reach: 1,
  });
  await Promise.resolve();
  asked.length = 0;

  pages.show({
    basis: { ...NEW_LIBRARY_LISTING },
    tabs: TABS,
    chosen: MANGA,
    reach: 1,
  });
  await Promise.resolve();

  expect(new Set(tabsListed(asked))).toEqual(
    new Set([undefined, "manga", "comics"]),
  );
});

test("keeps each tab's scroll position while the listing stays, and forgets them when it changes", () => {
  const { pages } = pagesAsked();
  pages.show({
    basis: NEW_LIBRARY_LISTING,
    tabs: TABS,
    chosen: MANGA,
    reach: 1,
  });
  pages.scroll.remember("manga", 640);
  pages.scroll.remember("comics", 120);
  pages.show({
    basis: NEW_LIBRARY_LISTING,
    tabs: TABS,
    chosen: COMICS,
    reach: 1,
  });

  const kept = [pages.scroll.recall("manga"), pages.scroll.recall("comics")];
  pages.show({
    basis: { ...NEW_LIBRARY_LISTING },
    tabs: TABS,
    chosen: COMICS,
    reach: 1,
  });

  expect(kept).toEqual([640, 120]);
  expect(pages.scroll.recall("manga")).toBe(0);
});

test("holds only the chosen tab's page when nothing beside it is wanted", async () => {
  const { asked, pages } = pagesAsked();

  pages.show({
    basis: NEW_LIBRARY_LISTING,
    tabs: TABS,
    chosen: MANGA,
    reach: 0,
  });
  await Promise.resolve();

  expect(tabsListed(asked)).toEqual(["manga"]);
  expect(tabsCounted(asked)).toEqual([]);
});

test("shows the chosen tab in the page it showed before when that page is no longer beside it, so its series stay until the new ones come", async () => {
  const { pages } = pagesAsked();
  pages.show({ basis: NEW_LIBRARY_LISTING, tabs: TABS, chosen: ALL, reach: 0 });
  await vi.waitFor(() => {
    expect(pages.of(ALL).series.list.kind).toBe("loaded");
  });
  const shown = pages.of(ALL);

  pages.show({
    basis: NEW_LIBRARY_LISTING,
    tabs: TABS,
    chosen: NOVELS,
    reach: 0,
  });

  expect(pages.of(NOVELS)).toBe(shown);
  expect(pages.of(NOVELS).series.list.kind).toBe("loaded");
});

test("keeps the chosen tab's page when the listing changes, so its series stay until the new ones come", async () => {
  const { pages } = pagesAsked();
  pages.show({
    basis: NEW_LIBRARY_LISTING,
    tabs: TABS,
    chosen: MANGA,
    reach: 0,
  });
  await vi.waitFor(() => {
    expect(pages.of(MANGA).series.list.kind).toBe("loaded");
  });
  const shown = pages.of(MANGA);

  pages.show({
    basis: { ...NEW_LIBRARY_LISTING },
    tabs: TABS,
    chosen: MANGA,
    reach: 0,
  });

  expect(pages.of(MANGA)).toBe(shown);
  expect(pages.of(MANGA).series.list.kind).toBe("loaded");
});

test("forgets the count of the page it shows another tab in, until that tab is counted", async () => {
  const { pages } = pagesAsked();
  pages.show({ basis: NEW_LIBRARY_LISTING, tabs: TABS, chosen: ALL, reach: 0 });
  await pages.of(ALL).count.load();

  pages.show({
    basis: NEW_LIBRARY_LISTING,
    tabs: TABS,
    chosen: NOVELS,
    reach: 0,
  });

  expect(pages.of(NOVELS).count.count).toBeUndefined();
});

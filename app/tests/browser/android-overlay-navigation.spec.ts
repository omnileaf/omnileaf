import type { Locator, Page } from "@playwright/test";

import type {
  LibraryCategory,
  LibraryFilter,
  LibraryListing,
  SeriesDetails,
} from "../../src/lib/ipc/bindings.ts";
import { NEW_LIBRARY_LISTING } from "../../src/lib/library/library-listing.ts";
import {
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  settle,
  test,
} from "./fixtures.ts";
import { entry } from "./history-entries.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const LIBRARY = sampleSeries(6);
const SHELF = new FakeShelf([{ state: "notStarted" }]);
const CATEGORIES = [
  { id: "manga", name: "Manga" },
  { id: "comics", name: "Comics" },
] as LibraryCategory[];
const DETAILS = {
  title: { fromFile: SERIES_TITLE, source: "folderName", edited: null },
  people: { fromFile: [], edited: null },
  tags: { fromFile: [], edited: null },
  summary: { fromFile: null, edited: null },
  year: null,
  language: null,
  isMarkedAdult: false,
  isRatedAdult: false,
} satisfies SeriesDetails;
const PHONE = { width: 412, height: 915 };
const TAB_SETTLES_MS = 600;
const HISTORY_BOOK = "Volume 4";

test.use({
  platform: "android",
  viewport: PHONE,
  backend: {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo("android"),
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    libraryCategories: () => [...CATEGORIES],
    categorySeries: (
      _category: string,
      after: Parameters<ReturnType<typeof pagedSeries>>[0],
      listing: Parameters<ReturnType<typeof pagedSeries>>[1],
    ) => pagedSeries(() => LIBRARY)(after, listing),
    categorySeriesCount: () => LIBRARY.length,
    seriesOverview: (id) => SHELF.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      SHELF.backend().seriesBooks(id, listing, after),
    keepsDetailEdits: () => true,
    seriesDetails: () => DETAILS,
    readingHistory: () => ({
      entries: [entry(4, "2026-10-08T21:40:00.000Z", { state: "end" })],
      next: null,
    }),
  },
});

function tab(page: Page, name: string): Locator {
  return page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name });
}

function pathOf(page: Page): string {
  return new URL(page.url()).pathname;
}

function entriesBehind(page: Page): Promise<number> {
  return page.evaluate(() => history.length);
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(LIBRARY.length);
}

async function openHistory(page: Page): Promise<void> {
  await openLibrary(page);
  await tab(page, "History").click();
  await expect(
    page.getByRole("heading", { level: 1, name: "History" }),
  ).toBeVisible();
}

async function expectTabsStillNavigate(page: Page): Promise<void> {
  await tab(page, "Settings").click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeVisible();

  await tab(page, "Library").click();

  await expect.poll(() => pathOf(page), { timeout: TAB_SETTLES_MS }).toBe("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem").first(),
  ).toBeVisible({ timeout: TAB_SETTLES_MS });
}

test.describe("a navigation that starts inside an overlay on Android", () => {
  test("lets the tabs keep navigating after History's menu opens the series", async ({
    page,
  }) => {
    await openHistory(page);
    await page
      .getByRole("button", { name: `More for ${HISTORY_BOOK}` })
      .click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.getByRole("menuitem", { name: "Open the series" }).click();
    await expect(page).toHaveURL(/\/series\//);

    await expectTabsStillNavigate(page);
  });

  test("leaves one history entry for History's menu opening the series, and Back returns to History", async ({
    page,
  }) => {
    await openHistory(page);
    const before = await entriesBehind(page);
    await page
      .getByRole("button", { name: `More for ${HISTORY_BOOK}` })
      .click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.getByRole("menuitem", { name: "Open the series" }).click();
    await expect(page).toHaveURL(/\/series\//);

    expect(await entriesBehind(page)).toBe(before + 1);
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe("/history");
    await expect(page.getByRole("menu")).toHaveCount(0);
    expect(await entriesBehind(page)).toBe(before + 1);
  });

  test("leaves one history entry for the series menu opening Edit details, and Back returns to the series", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
    ).toBeVisible();
    const before = await entriesBehind(page);
    await page
      .getByRole("button", { name: `More for ${SERIES_TITLE}`, exact: true })
      .click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.getByRole("menuitem", { name: "Edit details…" }).click();
    await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible();

    expect(await entriesBehind(page)).toBe(before + 1);
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe(`/series/${SERIES_ID}`);
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("leaves one history entry for a sheet's action opening Settings, and Back returns to the Library", async ({
    page,
  }) => {
    await openLibrary(page);
    const before = await entriesBehind(page);
    await page.getByRole("button", { name: "Every category" }).click();
    const sheet = page.getByRole("dialog", { name: "Categories" });
    await expect(sheet).toBeVisible();
    await settle(sheet);

    await sheet.getByRole("button", { name: "Edit", exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe("/settings/library/tabs");

    expect(await entriesBehind(page)).toBe(before + 1);
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe("/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("lets the tabs keep navigating after a sheet's action opens Settings", async ({
    page,
  }) => {
    await openLibrary(page);
    await page.getByRole("button", { name: "Every category" }).click();
    const sheet = page.getByRole("dialog", { name: "Categories" });
    await expect(sheet).toBeVisible();
    await settle(sheet);
    await sheet.getByRole("button", { name: "Edit", exact: true }).click();
    await expect.poll(() => pathOf(page)).toBe("/settings/library/tabs");

    await tab(page, "History").click();
    await expect(
      page.getByRole("heading", { level: 1, name: "History" }),
    ).toBeVisible();
    await tab(page, "Library").click();

    await expect
      .poll(() => pathOf(page), { timeout: TAB_SETTLES_MS })
      .toBe("/");
  });
});

const TAGGED_SHELF = new FakeShelf([{ state: "notStarted" }], {
  tags: ["Seinen", "Sea"],
});
const TAGGED = new Set([LIBRARY[0]?.id, LIBRARY[2]?.id]);
let stored: LibraryListing = NEW_LIBRARY_LISTING;
let asked: LibraryFilter[] = [];

test.describe("a tag tapped on the series page while an overlay holds an entry", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: () => fakeAppInfo("android"),
      seriesOverview: (id) => TAGGED_SHELF.backend().seriesOverview(id),
      seriesBooks: (id, listing, after) =>
        TAGGED_SHELF.backend().seriesBooks(id, listing, after),
      librarySeries: (_after, listing) => {
        asked.push(listing.filter);
        const wanted = listing.filter.tags;
        return {
          series: LIBRARY.filter(
            (one) => wanted.length === 0 || TAGGED.has(one.id),
          ),
          next: null,
        };
      },
      librarySeriesCount: () => LIBRARY.length,
      libraryListing: () => stored,
      setLibraryListing: (listing) => {
        stored = listing;
        return null;
      },
    },
  });

  test.beforeEach(() => {
    stored = NEW_LIBRARY_LISTING;
    asked = [];
  });

  async function tapTag(page: Page): Promise<void> {
    await page
      .getByRole("list", { name: "Tags" })
      .getByRole("link", { name: "Seinen" })
      .click();
    await expect(
      page.getByRole("list", { name: "Series" }).getByRole("listitem"),
    ).toHaveCount(TAGGED.size);
    expect(asked.at(-1)?.tags).toEqual(["Seinen"]);
  }

  test("filters the Library by the tag with the find field open", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES_ID}`);
    await page.getByRole("button", { name: "Find a book" }).click();
    await expect(
      page.getByRole("searchbox", { name: "Find a book" }),
    ).toBeFocused();

    await tapTag(page);
  });

  test("filters the Library by the tag while books are being selected", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES_ID}`);
    await page
      .getByRole("button", { name: `More for ${TAGGED_SHELF.titleOf(0)}` })
      .click();
    await page
      .getByRole("dialog", { name: TAGGED_SHELF.titleOf(0) })
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await expect(page.getByText("1 selected").first()).toBeVisible();

    await tapTag(page);
  });
});

test.describe("tabs after a step back SvelteKit ignores or a menu stacked on a sheet", () => {
  test("recovers when a step back lands on a copy of the entry it leaves", async ({
    page,
  }) => {
    await openHistory(page);
    await page.evaluate(() => {
      history.pushState(history.state, "", location.href);
    });

    await tab(page, "Library").click();

    await expect
      .poll(() => pathOf(page), { timeout: TAB_SETTLES_MS })
      .toBe("/");
    await expect(
      page.getByRole("list", { name: "Series" }).getByRole("listitem").first(),
    ).toBeVisible({ timeout: TAB_SETTLES_MS });
  });

  test("leaves one history entry for a tab tapped under a menu opened from a sheet, and the tabs keep working", async ({
    page,
  }) => {
    await openLibrary(page);
    const before = await entriesBehind(page);
    await page.getByRole("button", { name: /^Sort and filter/ }).click();
    const sheet = page.getByRole("dialog", { name: "Sort and filter" });
    await expect(sheet).toBeVisible();
    await settle(sheet);
    await sheet.getByRole("combobox", { name: "Sort by" }).click();
    await expect(page.getByRole("listbox", { name: "Sort by" })).toBeVisible();

    await tab(page, "Settings").dispatchEvent("click");

    await expect.poll(() => pathOf(page)).toBe("/settings");
    expect(await entriesBehind(page)).toBe(before + 1);
    await expectTabsStillNavigate(page);
  });
});

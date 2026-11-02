import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_BACKEND,
  expect,
  literalColour,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const WINDOW = { width: 1280, height: 800 };
const NARROW_WINDOW = { width: 800, height: 800 };
const FOUND = sampleSeries(6);
const SPELLING_ONLY = "harbor gat";
const CHAPTER_HITS = Array.from({ length: 8 }, (_, index) => ({
  series: FOUND[index % FOUND.length]?.id ?? "",
  seriesTitle: `Sample Series ${String(index + 1).padStart(2, "0")}`,
  book: `0190a3e4-0000-8000-8000-${String(index + 1).padStart(12, "0")}`,
  position: index + 1,
  title: `Harbour chapter ${String(index + 1)}`,
  matchedIn: "fileName",
})) as never[];

testOnlyInItsWebview("macos");
test.use({
  platform: "macos",
  viewport: WINDOW,
  backend: {
    ...DEFAULT_BACKEND,
    librarySearch: (_after, search) =>
      search.text === SPELLING_ONLY
        ? { series: [], next: null }
        : { series: FOUND, next: null },
    librarySearchCount: () => FOUND.length,
    librarySearchChapters: () => ({
      hits: CHAPTER_HITS,
      next: null,
      count: CHAPTER_HITS.length,
    }),
    librarySpellingSuggestion: () => ({
      text: "harbour gate",
      chapterOf: null,
    }),
  },
});

function seriesAt(index: number): { id: string } {
  const one = FOUND[index];
  if (one === undefined) {
    throw new Error(`the sample catalog has no series ${String(index)}`);
  }
  return one;
}

async function searchFor(page: Page, text: string): Promise<Locator> {
  await page.goto("/search");
  const field = page.getByRole("combobox", { name: "Search your library" });
  await field.fill(text);
  return field;
}

function results(page: Page): Locator {
  return page.getByRole("listbox", { name: "Series found" });
}

async function rowsOf(covers: Locator): Promise<number[]> {
  const tops = await covers
    .getByRole("option")
    .evaluateAll((options) =>
      options.map((option) => Math.round(option.getBoundingClientRect().top)),
    );
  return [...new Set(tops)];
}

test("selects a result with a click and lets the arrow keys move on from it", async ({
  page,
}) => {
  await searchFor(page, "series");
  const options = results(page).getByRole("option");
  await options.first().click();

  await page.keyboard.press("ArrowRight");

  await expect(options.first()).toHaveAttribute("aria-selected", "false");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/search/);
});

test("opens a result with a double click", async ({ page }) => {
  await searchFor(page, "series");

  await results(page).getByRole("option").nth(1).dblclick();

  await expect(page).toHaveURL(new RegExp(`/series/${seriesAt(1).id}`));
});

test("opens the selected result with Return", async ({ page }) => {
  await searchFor(page, "series");
  await results(page).getByRole("option").nth(2).click();
  await page.keyboard.press("ArrowLeft");

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`/series/${seriesAt(1).id}`));
});

test("opens the result clicked with Return, though the field had lost focus", async ({
  page,
}) => {
  const field = await searchFor(page, "series");
  await field.blur();

  await results(page).getByRole("option").nth(1).click();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`/series/${seriesAt(1).id}`));
});

test("rings the selected cover in the accent and puts its title on the accent", async ({
  page,
}) => {
  await searchFor(page, "series");
  const chosen = results(page).getByRole("option").first();
  await chosen.click();
  const cover = chosen.locator("[data-slot='list-cover']");

  await expect(cover).toHaveCSS("outline-width", "3px");
  await expect(cover).toHaveCSS("outline-offset", "2px");
  await expect(cover).toHaveCSS(
    "outline-color",
    await literalColour(page, "var(--color-accent)"),
  );
  await expect(chosen.getByText("Sample Series 0001")).toHaveCSS(
    "background-color",
    await literalColour(page, "var(--color-accent)"),
  );
});

test("marks the words found in the colours of a warning", async ({ page }) => {
  await searchFor(page, "series");
  const mark = results(page).locator("mark").first();

  await expect(mark).toHaveCSS(
    "background-color",
    await literalColour(page, "var(--color-warning-soft)"),
  );
  await expect(mark).toHaveCSS(
    "color",
    await literalColour(page, "var(--color-on-warning)"),
  );
  await expect(mark).toHaveCSS("border-radius", "3px");
});

test("says why each result matched under its title", async ({ page }) => {
  await searchFor(page, "series");
  const first = results(page).getByRole("option").first();

  await expect(first.getByText("Title", { exact: true })).toHaveCSS(
    "font-size",
    "11px",
  );
});

test("drops to four covers a row in a narrow window", async ({ page }) => {
  await page.setViewportSize(NARROW_WINDOW);
  await searchFor(page, "series");

  await expect(results(page).getByRole("option")).toHaveCount(FOUND.length);
  const rows = await rowsOf(results(page));

  expect(rows).toHaveLength(2);
  const inFirstRow = await results(page)
    .getByRole("option")
    .evaluateAll(
      (options, top) =>
        options.filter(
          (option) => Math.round(option.getBoundingClientRect().top) === top,
        ).length,
      rows[0],
    );
  expect(inFirstRow).toBe(4);
});

test("centres the spelling suggestion in the empty results", async ({
  page,
}) => {
  await searchFor(page, SPELLING_ONLY);
  const suggestion = page.getByText(/^Did you mean/);
  const column = page.getByRole("main");

  const box = await suggestion.boundingBox();
  const columnBox = await column.boundingBox();

  expect(box).not.toBeNull();
  expect(columnBox).not.toBeNull();
  const middle = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const columnMiddle = (columnBox?.x ?? 0) + (columnBox?.width ?? 0) / 2;
  expect(Math.abs(middle - columnMiddle)).toBeLessThan(2);
});

test("sets the no-results title in the Mac's large title type over a muted line", async ({
  page,
}) => {
  await page.goto("/search");
  await page
    .getByRole("combobox", { name: "Search your library" })
    .fill(SPELLING_ONLY);

  const title = page.getByRole("heading", { name: /^Nothing matches/ });

  await expect(title).toBeVisible();
  await expect(title).toHaveCSS("font-size", "26px");
  await expect(title).toHaveCSS("line-height", "32px");
  await expect(title).toHaveCSS("font-weight", "700");
  await expect(title).toHaveCSS("letter-spacing", "0.22px");
});

test("lists matching chapter titles as rows under a heading, five first", async ({
  page,
}) => {
  await searchFor(page, "harbour");

  const group = page.getByRole("region", { name: /^Chapter titles/ });

  await expect(group.getByRole("heading", { level: 2 })).toHaveText(
    "Chapter titles · 8",
  );
  await expect(group.getByRole("link")).toHaveCount(5);
  await expect(group.getByRole("link").first()).toContainText(
    "Harbour chapter 1",
  );
  await expect(group.getByRole("link").first()).toContainText(
    "Sample Series 01",
  );
});

test("shows every chapter title once Show all is chosen", async ({ page }) => {
  await searchFor(page, "harbour");
  const group = page.getByRole("region", { name: /^Chapter titles/ });

  await group.getByRole("button", { name: "Show all" }).click();

  await expect(group.getByRole("link")).toHaveCount(8);
  await expect(group.getByRole("button", { name: "Show all" })).toHaveCount(0);
});

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

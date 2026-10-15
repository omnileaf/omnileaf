import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(40);

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
  } satisfies FakeBackend,
});

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function coverOf(page: Page, index: number): Locator {
  return seriesList(page).getByRole("link", {
    name: new RegExp(LIBRARY[index]?.title ?? ""),
  });
}

async function columnsOf(page: Page): Promise<number> {
  return seriesList(page).evaluate(
    (list) =>
      getComputedStyle(list)
        .gridTemplateColumns.split(" ")
        .filter((track) => track !== "").length,
  );
}

async function focusFirst(page: Page): Promise<void> {
  await page.goto("/");
  await expect(coverOf(page, 0)).toBeVisible();
  await coverOf(page, 0).focus();
}

test("moves between covers with the arrow keys", async ({ page }) => {
  await focusFirst(page);
  const columns = await columnsOf(page);

  await page.keyboard.press("ArrowRight");
  await expect(coverOf(page, 1)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(coverOf(page, 1 + columns)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(coverOf(page, columns)).toBeFocused();
  await page.keyboard.press("ArrowUp");

  await expect(coverOf(page, 0)).toBeFocused();
});

test("jumps to the last cover listed with End, and back with Home", async ({
  page,
}) => {
  await focusFirst(page);

  await page.keyboard.press("End");
  await expect(coverOf(page, LIBRARY.length - 1)).toBeFocused();
  await page.keyboard.press("Home");

  await expect(coverOf(page, 0)).toBeFocused();
});

test("opens the series in focus with Enter", async ({ page }) => {
  await focusFirst(page);

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`/series/${LIBRARY[0]?.id ?? ""}$`));
});

test("starts selecting with the cover in focus on Space", async ({ page }) => {
  await focusFirst(page);
  await page.keyboard.press("ArrowRight");

  await page.keyboard.press("Space");

  await expect(
    seriesList(page).getByRole("checkbox", { name: LIBRARY[1]?.title ?? "" }),
  ).toBeChecked();
});

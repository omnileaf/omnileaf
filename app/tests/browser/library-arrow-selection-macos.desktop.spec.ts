import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(12);

testOnlyInItsWebview("macos");
test.use({
  platform: "macos",
  viewport: { width: 1280, height: 800 },
  backend: {
    ...DEFAULT_BACKEND,
    seriesLabels: () => ({
      keepsLabels: true,
      categories: [],
      tags: [],
      suggestedTags: [],
    }),
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

function covers(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function cover(page: Page, index: number): Locator {
  return covers(page).getByRole("listitem").nth(index).getByRole("checkbox");
}

async function selectFirst(page: Page): Promise<void> {
  await page.goto("/");
  await expect(covers(page).getByRole("listitem")).toHaveCount(LIBRARY.length);
  await covers(page)
    .getByRole("listitem")
    .nth(0)
    .getByRole("link")
    .first()
    .click();
  await expect(cover(page, 0)).toBeChecked();
}

test("moves the selection to the cover an arrow key reaches", async ({
  page,
}) => {
  await selectFirst(page);

  await page.keyboard.press("ArrowRight");

  await expect(cover(page, 1)).toBeChecked();
  await expect(cover(page, 0)).not.toBeChecked();
  await expect(page.getByText("1 of 12 selected")).toBeVisible();
});

test("adds the cover a Shift-arrow reaches to the selection", async ({
  page,
}) => {
  await selectFirst(page);

  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");

  await expect(page.getByText("3 of 12 selected")).toBeVisible();
  await expect(cover(page, 2)).toBeChecked();
});

test("selects the last cover with End and the first with Home", async ({
  page,
}) => {
  await selectFirst(page);

  await page.keyboard.press("End");
  await expect(cover(page, LIBRARY.length - 1)).toBeChecked();
  await expect(page.getByText("1 of 12 selected")).toBeVisible();
  await page.keyboard.press("Home");

  await expect(cover(page, 0)).toBeChecked();
  await expect(page.getByText("1 of 12 selected")).toBeVisible();
});

test("selects a series with the arrows before anything was selected", async ({
  page,
}) => {
  await page.goto("/");
  await expect(covers(page).getByRole("listitem")).toHaveCount(LIBRARY.length);
  await covers(page)
    .getByRole("listitem")
    .nth(0)
    .getByRole("link")
    .first()
    .focus();

  await page.keyboard.press("ArrowRight");

  await expect(cover(page, 1)).toBeChecked();
});

import type { Page } from "@playwright/test";

import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(12);

testOnlyInItsWebview("macos");
test.use({
  platform: "macos",
  viewport: { width: 1280, height: 800 },
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
    libraryFilterChoices: () => ({
      formats: ["comic", "manga"],
      languages: [],
      tags: [],
      ratesAdult: false,
      keepsBookmarks: false,
      smart: [],
    }),
  },
});

async function filterByManga(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(LIBRARY.length);
  await page
    .getByRole("button", { name: "Sort and filter", exact: true })
    .click();
  await page.getByRole("button", { name: "Manga" }).click();
  await page
    .getByRole("button", { name: "Sort and filter, 1 filter on", exact: true })
    .click();
}

test("draws a filter in use as an accent-soft chip with a cross", async ({
  page,
}) => {
  await filterByManga(page);
  const chip = page
    .getByRole("list", { name: "Filters in use" })
    .getByRole("listitem")
    .first();

  await expect(chip).toHaveCSS(
    "background-color",
    await tokenColour(page, "--native-color-accent-soft"),
  );
  await expect(chip).toHaveCSS("border-top-width", "0px");
  await expect(chip.getByRole("button", { name: /^Remove/ })).toBeVisible();
});

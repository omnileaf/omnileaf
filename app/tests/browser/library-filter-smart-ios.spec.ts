import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  LARGE_MIN_WIDTH,
  settle,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";
import { openSortAndFilter } from "./library-controls.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(3);
const ROW_HEIGHT = 56;
const ROW_PADDING = "10px";
const ROW_GAP = "12px";
const TITLE_SIZE = "16px";
const TITLE_LINE = "24px";
const HINT_SIZE = "14px";
const HINT_LINE = "20px";

testOnlyInItsWebview("ios");
test.use({
  backend: {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo("ios"),
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
    libraryFilterChoices: () => ({
      formats: ["comic"],
      languages: [],
      tags: [],
      ratesAdult: true,
      keepsBookmarks: true,
      smart: ["quickReads", "forgotten"],
    }),
  },
});

function sheetOf(page: Page): Locator {
  return page
    .getByRole("dialog", { name: "Sort and filter" })
    .or(page.getByRole("complementary", { name: "Sort and filter" }));
}

test.beforeEach(async ({ page }) => {
  test.skip(
    viewportOf(page).width >= LARGE_MIN_WIDTH,
    "the large layout is the desktop one",
  );
  await page.goto("/");
  await expect(
    page.getByText(LIBRARY[0]?.title ?? "", { exact: true }),
  ).toBeVisible();
  await openSortAndFilter(page);
  await settle(sheetOf(page));
});

test("keeps each smart filter as a 56px switch row with its own type", async ({
  page,
}) => {
  const forgotten = sheetOf(page).getByRole("switch", { name: "Forgotten" });

  expect((await boxOf(forgotten)).height).toBeGreaterThanOrEqual(ROW_HEIGHT);
  await expect(forgotten).toHaveCSS("padding-top", ROW_PADDING);
  await expect(forgotten).toHaveCSS("padding-bottom", ROW_PADDING);
  await expect(forgotten).toHaveCSS("column-gap", ROW_GAP);
  const title = sheetOf(page).getByText("Forgotten", { exact: true });
  await expect(title).toHaveCSS("font-size", TITLE_SIZE);
  await expect(title).toHaveCSS("line-height", TITLE_LINE);
  const hint = sheetOf(page).getByText("Not opened in 3 months.");
  await expect(hint).toHaveCSS("font-size", HINT_SIZE);
  await expect(hint).toHaveCSS("line-height", HINT_LINE);
});

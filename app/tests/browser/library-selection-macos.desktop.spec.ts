import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const WINDOW = { width: 1280, height: 800 };
const LIBRARY = sampleSeries(12);
const TOOLBAR_BOTTOM_PX = 120;

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: WINDOW });

test.use({
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

function group(page: Page): Locator {
  return page.getByRole("group", { name: "Selected series" });
}

async function pickTwo(page: Page): Promise<void> {
  await page.goto("/");
  await expect(covers(page).getByRole("listitem")).toHaveCount(LIBRARY.length);
  await covers(page)
    .getByRole("listitem")
    .nth(0)
    .getByRole("link")
    .first()
    .click({ modifiers: ["Meta"] });
  await covers(page).getByRole("checkbox").nth(1).click();
}

test("keeps the Library heading and says how many of the series are selected", async ({
  page,
}) => {
  await pickTwo(page);

  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  await expect(page.getByText("2 of 12 selected")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Select all/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Cancel selecting" }),
  ).toHaveCount(0);
});

test("puts Categories, Tags, Mark as read and Delete in the toolbar, not at the bottom", async ({
  page,
}) => {
  await pickTwo(page);

  await expect(group(page)).toHaveCount(1);
  for (const name of ["Categories", "Tags", "Mark as read", "Delete"]) {
    const button = group(page).getByRole("button", { name });
    await expect(button).toBeVisible();
    expect((await boxOf(button)).y).toBeLessThan(TOOLBAR_BOTTOM_PX);
  }
});

test("clears the selection with Escape", async ({ page }) => {
  await pickTwo(page);

  await page.keyboard.press("Escape");

  await expect(group(page)).toHaveCount(0);
  await expect(page.getByText("2 of 12 selected")).toHaveCount(0);
});

test("clears the selection with a click on empty space", async ({ page }) => {
  await pickTwo(page);

  await page.mouse.click(WINDOW.width - 4, WINDOW.height - 4);

  await expect(group(page)).toHaveCount(0);
});

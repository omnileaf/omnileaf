import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(8);
const LIST_VIEW: LibraryView = { ...DEFAULT_LIBRARY_VIEW, display: "list" };

testOnlyInItsWebview("macos");
test.use({
  platform: "macos",
  viewport: { width: 1280, height: 800 },
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

function covers(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function cover(page: Page, index: number): Locator {
  return covers(page).locator("[data-pickable-link]").nth(index);
}

function picked(page: Page): Locator {
  return covers(page).getByRole("checkbox", { checked: true });
}

function seriesUrl(index: number): RegExp {
  return new RegExp(`/series/${LIBRARY[index]?.id ?? ""}$`);
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(covers(page).getByRole("listitem")).toHaveCount(LIBRARY.length);
}

test.describe("covers", () => {
  test("selects the cover that is clicked and stays in the library", async ({
    page,
  }) => {
    await openLibrary(page);

    await cover(page, 2).click();

    await expect(picked(page)).toHaveCount(1);
    await expect(cover(page, 2)).toBeChecked();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("1 of 8 selected")).toBeVisible();
  });

  test("moves the selection to the next cover clicked", async ({ page }) => {
    await openLibrary(page);
    await cover(page, 2).click();

    await cover(page, 4).click();

    await expect(picked(page)).toHaveCount(1);
    await expect(cover(page, 4)).toBeChecked();
  });

  test("adds a cover clicked with Command and removes it on a second Command-click", async ({
    page,
  }) => {
    await openLibrary(page);
    await cover(page, 1).click();

    await cover(page, 3).click({ modifiers: ["Meta"] });
    await expect(picked(page)).toHaveCount(2);
    await cover(page, 3).click({ modifiers: ["Meta"] });

    await expect(picked(page)).toHaveCount(1);
    await expect(cover(page, 1)).toBeChecked();
  });

  test("adds the covers between with Shift-click", async ({ page }) => {
    await openLibrary(page);
    await cover(page, 1).click();

    await cover(page, 4).click({ modifiers: ["Shift"] });

    await expect(picked(page)).toHaveCount(4);
  });

  test("keeps only the clicked cover when it was one of several selected", async ({
    page,
  }) => {
    await openLibrary(page);
    await cover(page, 1).click();
    await cover(page, 2).click({ modifiers: ["Meta"] });

    await cover(page, 2).click();

    await expect(picked(page)).toHaveCount(1);
    await expect(cover(page, 2)).toBeChecked();
  });

  test("adds the focused cover with Space and takes it off with a second Space", async ({
    page,
  }) => {
    await openLibrary(page);
    await cover(page, 1).click();

    await cover(page, 3).focus();
    await page.keyboard.press("Space");
    await expect(picked(page)).toHaveCount(2);
    await page.keyboard.press("Space");

    await expect(picked(page)).toHaveCount(1);
    await expect(cover(page, 1)).toBeChecked();
  });

  test("ends the selection with Escape", async ({ page }) => {
    await openLibrary(page);
    await cover(page, 2).click();

    await page.keyboard.press("Escape");

    await expect(picked(page)).toHaveCount(0);
    await expect(page.getByText("1 of 8 selected")).toBeHidden();
  });

  test("opens the series when its link is activated without a pointer", async ({
    page,
  }) => {
    await openLibrary(page);

    await cover(page, 4).evaluate((link) => {
      if (link instanceof HTMLElement) {
        link.click();
      }
    });

    await expect(page).toHaveURL(seriesUrl(4));
  });

  test("opens the series on a double click", async ({ page }) => {
    await openLibrary(page);

    await cover(page, 3).dblclick();

    await expect(page).toHaveURL(seriesUrl(3));
  });

  test("opens the selected series on Return", async ({ page }) => {
    await openLibrary(page);
    await cover(page, 5).click();

    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(seriesUrl(5));
  });
});

test.describe("rows", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      librarySeries: () => ({ series: LIBRARY, next: null }),
      librarySeriesCount: () => LIBRARY.length,
      libraryView: () => LIST_VIEW,
    },
  });

  test("selects the row that is clicked and opens it on a double click", async ({
    page,
  }) => {
    await openLibrary(page);

    await cover(page, 1).click();

    await expect(picked(page)).toHaveCount(1);
    await expect(page).toHaveURL(/\/$/);
    await cover(page, 1).dblclick();
    await expect(page).toHaveURL(seriesUrl(1));
  });
});

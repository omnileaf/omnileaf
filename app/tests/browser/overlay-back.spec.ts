import type { Locator, Page } from "@playwright/test";

import type {
  LibraryCategory,
  SeriesLabels,
} from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, settle, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
const CATEGORY = { id: "reading", name: "Reading" } as LibraryCategory;
const PHONE_WIDTH = 500;
const HELD_MS = 800;
let historyFollowed = 0;

function labelsFor(series: readonly string[]): SeriesLabels {
  return {
    keepsLabels: true,
    categories: [{ category: CATEGORY, holding: series.length }],
    tags: [{ tag: "Sea", holding: series.length }],
    suggestedTags: [],
  };
}

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    seriesLabels: (series) => labelsFor(series),
    followBackHistory: () => {
      historyFollowed += 1;
      return null;
    },
  },
});

test.beforeEach(() => {
  historyFollowed = 0;
});

async function openLibrary(page: Page): Promise<Locator> {
  await page.goto("/");
  const list = page.getByRole("list", { name: "Series" });
  await expect(list.getByRole("listitem")).toHaveCount(LIBRARY.length);
  return list;
}

async function openSortAndFilter(page: Page): Promise<Locator> {
  await openLibrary(page);
  await page.getByRole("button", { name: /^Sort and filter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Sort and filter" });
  await expect(sheet).toBeVisible();
  await settle(sheet);
  return sheet;
}

async function openCategoriesAndTags(page: Page): Promise<Locator> {
  const list = await openLibrary(page);
  const touch = { pointerType: "touch", pointerId: 3, isPrimary: true };
  await list
    .getByRole("listitem")
    .nth(1)
    .getByRole("link")
    .first()
    .dispatchEvent("pointerdown", touch);
  await page.waitForTimeout(HELD_MS);
  const picked = list.getByRole("checkbox", { name: LIBRARY[1]?.title ?? "" });
  await picked.dispatchEvent("pointerup", touch);
  await picked.dispatchEvent("click");
  await page
    .getByRole("group", { name: "Selected series" })
    .getByRole("button", { name: "Categories" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Categories and tags" });
  await expect(sheet).toBeVisible();
  await settle(sheet);
  return sheet;
}

test.describe("back while a sheet is open", { tag: "@native" }, () => {
  test.describe("on an Android phone", () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android follows the page's history");
    });

    test("closes Sort and filter and stays on the Library", async ({
      page,
    }) => {
      const sheet = await openSortAndFilter(page);
      await expect.poll(() => historyFollowed).toBeGreaterThan(0);

      await page.goBack();

      await expect(sheet).toBeHidden();
      await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/");
    });

    test("closes Categories and tags and keeps the selection", async ({
      page,
    }) => {
      const sheet = await openCategoriesAndTags(page);

      await page.goBack();

      await expect(sheet).toBeHidden();
      await expect(
        page.getByRole("group", { name: "Selected series" }),
      ).toBeVisible();
    });

    test("leaves no history entry behind when the sheet closes by Escape", async ({
      page,
    }) => {
      const sheet = await openSortAndFilter(page);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();

      await page.goBack();

      expect(page.url()).toBe("about:blank");
    });

    test("closes the sheet by back each time it is opened", async ({
      page,
    }) => {
      const sheet = await openSortAndFilter(page);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await page.getByRole("button", { name: /^Sort and filter/ }).click();
      await expect(sheet).toBeVisible();

      await page.goBack();

      await expect(sheet).toBeHidden();
    });
  });
});

test.describe("an open sheet on a platform that does not follow the page's history", () => {
  test.describe("on a phone", () => {
    test.beforeEach(({ platform, viewport }) => {
      test.skip(
        platform === "android" || (viewport?.width ?? 0) > PHONE_WIDTH,
        "a phone that leaves the page's history to its platform",
      );
    });

    test("adds no history entry", async ({ page }) => {
      await openLibrary(page);
      const entries = await page.evaluate(() => history.length);

      await page.getByRole("button", { name: /^Sort and filter/ }).click();
      await expect(
        page.getByRole("dialog", { name: "Sort and filter" }),
      ).toBeVisible();

      expect(await page.evaluate(() => history.length)).toBe(entries);
      expect(historyFollowed).toBe(0);
    });
  });
});

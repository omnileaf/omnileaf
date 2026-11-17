import type { Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const HOME = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "Internal storage › Documents › Omnileaf",
  isAvailable: true,
} as const;

const COMICS = {
  id: "2",
  kind: "linked",
  name: "Comics",
  location: "Internal storage › Comics",
  isAvailable: true,
} as const;

const MANGA = {
  id: "3",
  kind: "linked",
  name: "Manga",
  location: "Internal storage › Manga",
  isAvailable: true,
} as const;

const BOOKS = {
  id: "4",
  kind: "linked",
  name: "Books",
  location: "Internal storage › Books",
  isAvailable: true,
} as const;

const SECOND_PAGE = "after-comics";
const TWO_PANE_WIDTH = 840;
const SERIES_COUNT = 3;

function libraryRow(page: Page) {
  return page.getByRole("main").getByRole("link", { name: /^Library/ });
}

test.describe("the Library row in Settings with only the home folder", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) >= TWO_PANE_WIDTH,
    "wide windows show Settings beside a list with no summaries",
  );
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      libraryFolders: () => ({ folders: [HOME], next: null }),
    },
  });

  test("names no folders, as Settings › Library lists none", async ({
    page,
  }) => {
    await page.goto("/settings");

    await expect(libraryRow(page)).toBeVisible();
    await expect(libraryRow(page)).not.toContainText("folder");
  });
});

test.describe("the Library row in Settings with linked folders", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) >= TWO_PANE_WIDTH,
    "wide windows show Settings beside a list with no summaries",
  );
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      libraryFolders: (after) =>
        after === null
          ? { folders: [HOME, COMICS], next: SECOND_PAGE }
          : { folders: [MANGA, BOOKS], next: null },
      librarySeriesCount: () => SERIES_COUNT,
    },
  });

  test("counts the linked folders on every page, leaving out the home folder", async ({
    page,
  }) => {
    await page.goto("/settings");

    await expect(libraryRow(page)).toContainText("3 folders · 3 series");
  });
});

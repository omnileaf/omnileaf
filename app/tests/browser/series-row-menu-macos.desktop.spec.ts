import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_BACKEND,
  expect,
  testOnlyInItsWebview,
  test,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const WINDOW = { width: 1280, height: 800 };

let shelf = new FakeShelf([]);
let shownInFolder: string[] = [];

test.beforeEach(() => {
  shownInFolder = [];
  shelf = new FakeShelf(
    Array.from({ length: 4 }, () => ({ state: "notStarted" }) as const),
  );
});

test.use({
  viewport: WINDOW,
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    bookmarkPages: (book, pages, isBookmarked) =>
      shelf.backend().bookmarkPages(book, pages, isBookmarked),
    showBookInFolder: (book) => {
      shownInFolder = [...shownInFolder, book];
      return null;
    },
    previewRemoval: (targets) => ({
      books: targets.length,
      files: targets.length,
      folders: 1,
    }),
  },
});

async function openMenuOf(page: Page, index: number): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `More for ${shelf.titleOf(index)}` })
    .click();
}

function bookmarkItem(page: Page) {
  return page.getByRole("menuitem", { name: "Bookmark", exact: true });
}

test.describe("a book's row menu on macOS", () => {
  testOnlyInItsWebview("macos");
  test.use({ platform: "macos" });

  test("bookmarks the book", async ({ page }) => {
    await openMenuOf(page, 1);

    await bookmarkItem(page).click();

    await expect
      .poll(() => shelf.bookmarked)
      .toEqual([{ book: shelf.idOf(1), pages: [0], isBookmarked: true }]);
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: shelf.titleOf(1) })
        .getByRole("img", { name: "Bookmarked" }),
    ).toBeVisible();
  });

  test("leaves Bookmark out for a book already bookmarked", async ({
    page,
  }) => {
    shelf.bookmark(1);
    await openMenuOf(page, 1);

    await expect(
      page.getByRole("menuitem", { name: "Mark read", exact: true }),
    ).toBeVisible();
    await expect(bookmarkItem(page)).toHaveCount(0);
  });

  test("ends with Show in Finder, then Delete in plain text", async ({
    page,
  }) => {
    await openMenuOf(page, 1);
    const items = page.getByRole("menu").getByRole("menuitem");

    await expect(items).toHaveText([
      /^\s*(Continue|Start) reading/,
      /^\s*Mark read/,
      /^\s*Bookmark/,
      /^\s*Show in Finder/,
      /^\s*Delete/,
    ]);
    const colourOf = (item: Locator) =>
      item.evaluate((element) => getComputedStyle(element).color);
    expect(await colourOf(items.last())).toBe(await colourOf(items.first()));
  });

  test("shows the book in Finder", async ({ page }) => {
    await openMenuOf(page, 1);

    await page.getByRole("menuitem", { name: "Show in Finder" }).click();

    await expect.poll(() => shownInFolder).toEqual([shelf.idOf(1)]);
  });

  test("asks before removing the book from the library", async ({ page }) => {
    await openMenuOf(page, 1);

    await page.getByRole("menuitem", { name: "Delete" }).click();

    await expect(
      page.getByRole("alertdialog", { name: "Remove from your library?" }),
    ).toBeVisible();
  });
});

test.describe("a book's row menu on Linux", () => {
  testOnlyInItsWebview("linux");
  test.use({ platform: "linux" });

  test("keeps its items as they were", async ({ page }) => {
    await openMenuOf(page, 1);

    await expect(
      page.getByRole("menuitem", { name: "Mark read", exact: true }),
    ).toBeVisible();
    await expect(bookmarkItem(page)).toHaveCount(0);
  });
});

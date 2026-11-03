import type { Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const NOT_STARTED = { state: "notStarted" } as const;
const BOOKMARKED_BOOK = 1;
const PLAIN_BOOK = 0;

let shelf = new FakeShelf([]);

test.beforeEach(() => {
  shelf = new FakeShelf([NOT_STARTED, NOT_STARTED, NOT_STARTED]);
  shelf.bookmark(BOOKMARKED_BOOK);
});

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    bookmarkPages: (book, pages, isBookmarked) =>
      shelf.backend().bookmarkPages(book, pages, isBookmarked),
    clearBookmarks: (books) => shelf.backend().clearBookmarks(books),
  },
});

async function openSheetOf(page: Page, index: number): Promise<Locator> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `More for ${shelf.titleOf(index)}` })
    .click();
  const sheet = page.getByRole("dialog", { name: shelf.titleOf(index) });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe(
  "bookmarking a book from its sheet on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's bottom sheet");
    });

    test("lists Bookmark between Mark and Select", async ({ page }) => {
      const sheet = await openSheetOf(page, PLAIN_BOOK);

      await expect(sheet.getByRole("button")).toHaveText([
        /^\s*Mark read$/,
        /^\s*Bookmark$/,
        /^\s*Select$/,
        /^\s*Delete$/,
      ]);
    });

    test("bookmarks that book and closes the sheet", async ({ page }) => {
      const sheet = await openSheetOf(page, PLAIN_BOOK);

      await sheet.getByRole("button", { name: "Bookmark" }).click();

      await expect(sheet).toBeHidden();
      expect(shelf.bookmarked).toEqual([
        { book: shelf.idOf(PLAIN_BOOK), pages: [0], isBookmarked: true },
      ]);
      await expect(
        page
          .getByRole("list", { name: "Books" })
          .getByRole("listitem")
          .nth(PLAIN_BOOK)
          .getByRole("img", { name: "Bookmarked" }),
      ).toBeVisible();
    });

    test("offers Remove bookmark instead of Bookmark on a bookmarked book", async ({
      page,
    }) => {
      const sheet = await openSheetOf(page, BOOKMARKED_BOOK);

      await expect(
        sheet.getByRole("button", { name: "Remove bookmark" }),
      ).toBeVisible();
      await expect(
        sheet.getByRole("button", { name: "Bookmark", exact: true }),
      ).toHaveCount(0);
    });

    test("removes the bookmarks of that book when asked", async ({ page }) => {
      const sheet = await openSheetOf(page, BOOKMARKED_BOOK);

      await sheet.getByRole("button", { name: "Remove bookmark" }).click();

      await expect(sheet).toBeHidden();
      expect(shelf.bookmarksCleared).toEqual([[shelf.idOf(BOOKMARKED_BOOK)]]);
      expect(shelf.bookmarked).toEqual([]);
      await expect(
        page
          .getByRole("list", { name: "Books" })
          .getByRole("listitem")
          .nth(BOOKMARKED_BOOK)
          .getByRole("img", { name: "Bookmarked" }),
      ).toBeHidden();
    });
  },
);

test.describe("the book sheet on Linux in a narrow window", () => {
  test.use({ platform: "linux", viewport: { width: 390, height: 844 } });

  test("does not list Bookmark", async ({ page }) => {
    const sheet = await openSheetOf(page, PLAIN_BOOK);

    await expect(sheet.getByRole("button", { name: "Select" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /bookmark/i })).toHaveCount(
      0,
    );
  });
});

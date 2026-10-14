import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  NOT_STARTED,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

interface BookmarkChange {
  readonly pages: readonly number[];
  readonly isBookmarked: boolean;
}

const changes: BookmarkChange[] = [];

function keepingBookmarks(kept: number[]): FakeBackend {
  return {
    ...readerBackend(DEFAULT_BACKEND),
    openBook: () => ({ ...readerBook(NOT_STARTED), bookmarkedPages: kept }),
    bookmarkPages: (book, pages, isBookmarked) => {
      expect(book).toBe(BOOK_ID);
      changes.push({ pages, isBookmarked });
      return null;
    },
  };
}

test.beforeEach(() => {
  changes.length = 0;
});

async function openBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function bookmark(page: Page, name = "Bookmark this page"): Locator {
  return page.locator("main > header").getByRole("button", { name });
}

function toast(page: Page, opening: string): Locator {
  return page
    .getByRole("region", { name: "Notifications F6" })
    .getByRole("listitem")
    .filter({ hasText: opening });
}

test.describe("a book in a library that keeps bookmarks", () => {
  test.use({ backend: keepingBookmarks([]) });

  test("bookmarks the page shown, keeps the bookmark pressed and offers Undo", async ({
    page,
  }) => {
    await openBook(page);

    await bookmark(page).click();

    await expect(bookmark(page)).toHaveAttribute("aria-pressed", "true");
    const shown = toast(page, "Page 1 bookmarked");
    await expect(shown).toBeVisible();
    await shown.getByRole("button", { name: "Undo" }).click();
    await expect(bookmark(page)).toHaveAttribute("aria-pressed", "false");
    expect(changes).toEqual([
      { pages: [0], isBookmarked: true },
      { pages: [0], isBookmarked: false },
    ]);
  });

  test("names both pages shown side by side, in its label and its toast", async ({
    page,
  }) => {
    await openBook(page);
    await page
      .getByRole("group", { name: "Quick settings" })
      .getByRole("button", { name: "Two pages" })
      .click();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("m");

    await bookmark(page, "Bookmark these pages").click();

    await expect(toast(page, "Pages 2–3 bookmarked")).toBeVisible();
    expect(changes).toEqual([{ pages: [1, 2], isBookmarked: true }]);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`a bookmarked page has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openBook(page);
      await bookmark(page).click();
      await expect(toast(page, "Page 1 bookmarked")).toBeVisible();

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("a page already bookmarked", () => {
  test.use({ backend: keepingBookmarks([0]) });

  test("removes the bookmark on a second press, and offers Undo", async ({
    page,
  }) => {
    await openBook(page);
    await expect(bookmark(page)).toHaveAttribute("aria-pressed", "true");

    await bookmark(page).click();

    await expect(bookmark(page)).toHaveAttribute("aria-pressed", "false");
    await expect(toast(page, "Bookmark on page 1 removed")).toBeVisible();
    expect(changes).toEqual([{ pages: [0], isBookmarked: false }]);
  });
});

test.describe("a bookmark the library fails to keep", () => {
  test.use({
    backend: {
      ...keepingBookmarks([]),
      bookmarkPages: () => {
        throw new CommandFailure({
          code: "internal",
          message: "something went wrong inside the app",
        });
      },
    },
  });

  test("lets go of the bookmark and says it wasn't kept", async ({ page }) => {
    await openBook(page);

    await bookmark(page).click();

    await expect(toast(page, "Couldn't keep the bookmark")).toBeVisible();
    await expect(bookmark(page)).toHaveAttribute("aria-pressed", "false");
  });
});

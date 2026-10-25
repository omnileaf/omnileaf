import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  NEXT_BOOK,
  NOT_STARTED,
  PAGE_COUNT,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const ON_PAGE_14 = {
  reading: { state: "started", page: 14 },
  startPage: 13,
} as const;

const TABLET = { width: 820, height: 1180 };

const NEXT_BOOK_PAGE = new RegExp(`/read/${NEXT_BOOK.id}$`);

function readsQuietly(platform: Platform | undefined): boolean {
  return platform === "ios" || platform === "android";
}

async function openBook(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

function notice(page: Page, opening: string): Locator {
  return page
    .getByRole("region", { name: "Notifications F6" })
    .getByRole("listitem")
    .filter({ hasText: opening });
}

async function expectNotice(
  shown: Locator,
  platform: Platform | undefined,
): Promise<void> {
  if (readsQuietly(platform)) {
    await expect(shown).toHaveCount(0);
  } else {
    await expect(shown).toBeVisible();
  }
}

test.describe("the reader on a phone", { tag: "@native" }, () => {
  test.describe("a half-read book", () => {
    test.use({
      backend: {
        ...readerBackend(DEFAULT_BACKEND),
        openBook: () => readerBook(ON_PAGE_14),
      },
    });

    test("opens on its saved page without a notice", async ({
      page,
      platform,
    }) => {
      await openBook(page);

      await expect(
        page.getByRole("img", { name: "Page 14", exact: true }),
      ).toBeVisible();
      await expectNotice(notice(page, "Back on page 14"), platform);
    });

    test("still says where it opened on a tablet", async ({ page }) => {
      await page.setViewportSize(TABLET);

      await openBook(page);

      await expect(notice(page, "Back on page 14")).toBeVisible();
    });
  });

  test.describe("a book its details say reads right to left", () => {
    test.use({
      backend: {
        ...readerBackend(DEFAULT_BACKEND),
        openBook: () => ({
          ...readerBook(NOT_STARTED),
          readingDirection: "rightToLeft",
        }),
      },
    });

    test("turns the right way without a notice", async ({ page, platform }) => {
      await openBook(page);

      await expectNotice(notice(page, "Reading right to left"), platform);
    });
  });

  test.describe("a library that keeps bookmarks", () => {
    test.use({
      backend: {
        ...readerBackend(DEFAULT_BACKEND),
        openBook: () => ({ ...readerBook(NOT_STARTED), bookmarkedPages: [] }),
        bookmarkPages: () => null,
      },
    });

    test("fills the bookmark without a notice", async ({ page, platform }) => {
      await openBook(page);
      const bookmark = page
        .locator("main > header")
        .getByRole("button", { name: "Bookmark this page" });

      await bookmark.click();

      await expect(bookmark).toHaveAttribute("aria-pressed", "true");
      await expectNotice(notice(page, "Page 1 bookmarked"), platform);
    });
  });

  test.describe("with Skip Up next on", () => {
    test.use({
      backend: {
        ...DEFAULT_BACKEND,
        openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
      },
    });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("omnileaf.skipUpNext", "on");
      });
    });

    test("opens the next book without a notice", async ({ page, platform }) => {
      await openBook(page);
      await page.keyboard.press("End");
      await expect(
        page.getByRole("img", {
          name: `Page ${String(PAGE_COUNT)}`,
          exact: true,
        }),
      ).toBeVisible();

      await page.keyboard.press("ArrowRight");

      await expect(page).toHaveURL(NEXT_BOOK_PAGE);
      await expectNotice(
        notice(page, `Now reading ${NEXT_BOOK.title}`),
        platform,
      );
    });
  });
});

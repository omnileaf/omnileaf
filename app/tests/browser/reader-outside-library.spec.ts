import type { Platform } from "../../src/lib/ipc/bindings.ts";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { NOT_STARTED, readerBook, servePages } from "./reader-book.ts";

const FAKE_SERIES_ID = "0190a3e4-0000-8000-8000-00000000dead";
const SERIES_URL = new RegExp(`/series/${FAKE_SERIES_ID}$`);

const OPENED_FROM = {
  ios: "Opened from Files",
  android: "Opened from your file manager",
  macos: "Opened from Finder",
  windows: "Opened from File Explorer",
  linux: "Opened from your file manager",
} satisfies Record<Platform, string>;

const BOOK = {
  ...readerBook(NOT_STARTED),
  series: FAKE_SERIES_ID,
  isInLibrary: false,
};

test.use({
  backend: { ...DEFAULT_BACKEND, openBook: () => BOOK },
});

test.describe(
  "a book opened from outside the library",
  { tag: "@native" },
  () => {
    test("says it isn't in the library, in each platform's own words", async ({
      page,
      platform,
    }) => {
      await servePages(page);
      await page.goto(`/read/${BOOK.id}`);

      const banner = page
        .getByRole("status")
        .filter({ hasText: "Opened from" });

      await expect(
        banner.getByText(OPENED_FROM[platform ?? "linux"]),
      ).toBeVisible();
      await expect(
        banner.getByText("This file isn't in your library."),
      ).toBeVisible();
    });

    test("goes back to the library, not the book's made-up series", async ({
      page,
    }) => {
      await servePages(page);
      await page.goto(`/read/${BOOK.id}`);

      await expect(
        page.getByRole("link", { name: "Back to the library" }),
      ).toHaveAttribute("href", "/");
    });

    test("names no series anywhere a back link could point at it", async ({
      page,
    }) => {
      await servePages(page);
      await page.goto(`/read/${BOOK.id}`);

      await expect(page.getByRole("link", { name: SERIES_URL })).toHaveCount(0);
      await expect(page.locator(`a[href*="${FAKE_SERIES_ID}"]`)).toHaveCount(0);
    });

    test("offers no way to jump to another book in the series", async ({
      page,
    }) => {
      await servePages(page);
      await page.goto(`/read/${BOOK.id}`);

      await expect(
        page.getByRole("button", { name: "Jump to a book" }),
      ).toHaveCount(0);

      await page.keyboard.press("g");

      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  },
);

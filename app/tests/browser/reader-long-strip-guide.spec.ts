import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  NOT_STARTED,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const STRIP_FOUND_KEY = `omnileaf.stripFound.${BOOK_SERIES_ID}`;
const STRIP_GUIDE_KEY = "omnileaf.readerGuide.strip";

const TALL_PAGES: FakeBackend = {
  ...readerBackend(DEFAULT_BACKEND),
  openBook: () => {
    const book = readerBook(NOT_STARTED);
    return {
      ...book,
      pages: book.pages.map((page) => ({
        ...page,
        size: { width: 800, height: 2400 },
      })),
    };
  },
};

test.use({ backend: TALL_PAGES });

async function openStrip(
  page: Page,
  stored: Record<string, string> = {},
): Promise<void> {
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      localStorage.setItem(key, value);
    }
  }, stored);
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(page.locator("[data-strip]")).toBeVisible();
}

function stripFound(page: Page): Locator {
  return page.getByRole("note", { name: "Opened as a long strip" });
}

function guide(page: Page): Locator {
  return page.getByRole("note", { name: /^(Tap|Click) to scroll$/ });
}

test("says a series of tall pages opened as a long strip, then shows how to scroll it", async ({
  page,
}) => {
  await openStrip(page);

  await expect(stripFound(page)).toContainText(
    "Its pages are tall and never form spreads, so it reads best scrolling down. You can change it for this series.",
  );
  await expect(guide(page)).toHaveCount(0);
  await stripFound(page).getByRole("button", { name: "Got it" }).click();

  await expect(stripFound(page)).toHaveCount(0);
  await expect(guide(page)).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STRIP_FOUND_KEY),
  ).not.toBeNull();
});

test("opens Reading settings at Reading mode from Change", async ({ page }) => {
  await openStrip(page);

  await stripFound(page).getByRole("button", { name: "Change" }).click();

  await expect(
    page.getByRole("combobox", { name: "Reading mode" }),
  ).toBeFocused();
  await expect(stripFound(page)).toHaveCount(0);
});

test("says how to scroll by tapping or clicking, and the keys on a desktop, once", async ({
  page,
}) => {
  await openStrip(page, { [STRIP_FOUND_KEY]: "seen" });

  await expect(guide(page)).toContainText(
    /(Tap the top to scroll up and the bottom to scroll down\. Tap the middle for the controls\.|Click the top to scroll up and the bottom to scroll down\. Click the middle for the controls\. The arrow keys and the wheel scroll too\.)/,
  );
  await guide(page).getByRole("button", { name: "Got it" }).click();

  await expect(guide(page)).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STRIP_GUIDE_KEY),
  ).not.toBeNull();
});

test("says nothing of a long strip chosen by hand", async ({ page }) => {
  await openStrip(page, {
    [`omnileaf.readingDirection.${BOOK_SERIES_ID}`]: "longStrip",
    [STRIP_GUIDE_KEY]: "seen",
  });

  await expect(page.locator("[data-strip]")).toBeVisible();
  await expect(stripFound(page)).toHaveCount(0);
});

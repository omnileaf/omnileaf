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

async function openBook(
  page: Page,
  stored: Record<string, string> = {},
): Promise<void> {
  await page.addInitScript((entries) => {
    localStorage.setItem("omnileaf.readerGuide.leftToRight", "seen");
    for (const [key, value] of Object.entries(entries)) {
      localStorage.setItem(key, value);
    }
  }, stored);
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
}

async function openSettings(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
}

function strip(page: Page): Locator {
  return page.locator("[data-strip]");
}

test.describe("Reading settings", () => {
  test.use({ backend: readerBackend(DEFAULT_BACKEND) });

  test("skips Up next from the End of a book section", async ({ page }) => {
    await openBook(page);
    await openSettings(page);
    const endOfBook = page.getByRole("region", { name: "End of a book" });
    const skip = endOfBook.getByRole("switch", { name: "Skip Up next" });
    await expect(skip).toHaveAccessibleDescription(
      "Go straight to the next book; Up next doesn’t show. Also on Up next.",
    );

    await skip.click();

    expect(
      await page.evaluate(() => localStorage.getItem("omnileaf.skipUpNext")),
    ).toBe("on");
  });

  test("reads the series as a long strip once Long strip is chosen as its reading mode", async ({
    page,
  }) => {
    await openBook(page);
    await openSettings(page);

    await page
      .getByRole("combobox", { name: "Reading mode" })
      .selectOption({ label: "Long strip" });

    await expect(strip(page)).toBeVisible();
  });
});

test.describe("a book of tall pages", () => {
  test.use({ backend: TALL_PAGES });

  test("names the long strip Automatic picked in Reading mode", async ({
    page,
  }) => {
    await openBook(page);
    await openSettings(page);

    await expect(
      page.getByRole("combobox", { name: "Reading mode" }),
    ).toHaveValue("automatic");
    await expect(
      page
        .getByRole("combobox", { name: "Reading mode" })
        .locator("option:checked"),
    ).toHaveText("Automatic (long strip)");
  });

  test("pages through it once Choose the reading mode for each series is off", async ({
    page,
  }) => {
    await openBook(page, {
      "omnileaf.smartFeatures": JSON.stringify({ choosesReadingMode: false }),
    });

    await expect(page.locator('img[alt="Page 1"]')).toBeVisible();
    await expect(strip(page)).toHaveCount(0);
  });
});

test.describe("Settings › Reader", () => {
  test.use({ backend: readerBackend(DEFAULT_BACKEND) });

  test("starts a series with no reading mode of its own in the one chosen for new series", async ({
    page,
  }) => {
    await page.goto("/settings/reading");
    await page
      .getByRole("combobox", { name: "Reading mode for new series" })
      .selectOption({ label: "Long strip" });

    await servePages(page);
    await page.goto(`/read/${BOOK_ID}`);

    await expect(strip(page)).toBeVisible();
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        `omnileaf.readingDirection.${BOOK_SERIES_ID}`,
      ),
    ).toBeNull();
  });

  test("puts Skip Up next under End of a book", async ({ page }) => {
    await page.goto("/settings/reading");

    await expect(
      page
        .getByRole("region", { name: "End of a book" })
        .getByRole("switch", { name: "Skip Up next" }),
    ).toHaveAccessibleDescription(
      "Go straight to the next book; Up next doesn’t show. Also on Up next.",
    );
  });

  test("offers Choose the reading mode for each series among the smart features", async ({
    page,
  }) => {
    await page.goto("/settings/reading");

    await expect(
      page.getByRole("region", { name: "Smart features" }).getByRole("switch", {
        name: "Choose the reading mode for each series",
      }),
    ).toHaveAccessibleDescription(
      "Reads a series’ details and its pages to pick paged or long strip.",
    );
  });
});

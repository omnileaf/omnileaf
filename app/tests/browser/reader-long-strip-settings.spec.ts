import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  NOT_STARTED,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const LOOK_KEY = "omnileaf.readerSettings.all";

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

async function openSettings(page: Page): Promise<Locator> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(page.locator("[data-strip]")).toBeVisible();
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
  return page.getByRole("region", { name: "Reading" });
}

test("sets a long strip's reading, screen and end of a book in its own sections", async ({
  page,
}) => {
  const reading = await openSettings(page);

  await expect(reading.getByRole("group", { name: "Apply to" })).toBeVisible();
  await expect(
    reading.getByRole("combobox", { name: "Reading mode" }),
  ).toHaveValue("automatic");
  await expect(
    reading.getByRole("group", { name: "Tap to scroll" }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Page layout" })).toHaveCount(0);
  const screen = page.getByRole("region", { name: "Screen" });
  await expect(
    screen.getByRole("switch", { name: "Keep the screen on" }),
  ).toBeVisible();
  await expect(
    screen.getByRole("slider", { name: "Brightness" }),
  ).toBeVisible();
  const endOfBook = page.getByRole("region", { name: "End of a book" });
  await expect(
    endOfBook.getByRole("switch", { name: "Book summary" }),
  ).toBeVisible();
  await expect(
    endOfBook.getByRole("switch", { name: "Skip Up next" }),
  ).toBeVisible();
});

test("says the middle always shows the controls, and keeps only it once Tap to scroll is off", async ({
  page,
}) => {
  const reading = await openSettings(page);
  await expect(
    reading.getByText("The middle always shows the controls."),
  ).toBeVisible();

  await reading
    .getByRole("group", { name: "Tap to scroll" })
    .getByRole("radio", { name: "Off" })
    .click();

  await expect(page.getByRole("button", { name: "Scroll down" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Scroll up" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Hide the controls" }),
  ).toHaveCount(1);
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    LOOK_KEY,
  );
  expect(JSON.parse(stored ?? "{}")).toMatchObject({ tapToScroll: "off" });
});

import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  NOT_STARTED,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const ROW_START = 16;
const TWO_LINE_ROW_PX = 72;

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

async function openStripSettings(page: Page): Promise<void> {
  await page.addInitScript((series) => {
    localStorage.setItem(`omnileaf.stripFound.${series}`, "seen");
    localStorage.setItem("omnileaf.readerGuide.strip", "seen");
  }, BOOK_SERIES_ID);
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(page.locator("[data-strip]")).toBeVisible();
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
}

test.describe(
  "A long strip's Reading settings on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    test("sets Reading mode as a flush two-line row that opens a choice dialog", async ({
      page,
    }) => {
      await openStripSettings(page);
      const sheet = page.getByRole("dialog", { name: "Reading settings" });
      const row = sheet.getByRole("button", { name: /^Reading mode/ });

      await expect(row).toHaveAttribute("aria-haspopup", "dialog");
      await expect(row).toContainText("Automatic (long strip)");
      await expect(sheet.getByRole("combobox")).toHaveCount(0);
      expect((await boxOf(row)).height).toBeGreaterThanOrEqual(TWO_LINE_ROW_PX);
      expect((await boxOf(row)).x).toBe((await boxOf(sheet)).x);
      expect((await boxOf(row.getByText("Reading mode"))).x).toBe(
        (await boxOf(sheet)).x + ROW_START,
      );

      await row.click();
      await page
        .getByRole("dialog", { name: "Reading mode" })
        .getByRole("radio", { name: "Long strip", exact: true })
        .click();
      await expect(row).toContainText("Long strip");
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations with its mode dialog open in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openStripSettings(page);
        await page.getByRole("button", { name: /^Reading mode/ }).click();
        await expect(
          page.getByRole("dialog", { name: "Reading mode" }),
        ).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  },
);

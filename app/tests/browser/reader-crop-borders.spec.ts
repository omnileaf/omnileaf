import type { Locator, Page } from "@playwright/test";

import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  NOT_STARTED,
  readerBackend,
  readerBook,
  servePages,
  type WireOpening,
} from "./reader-book.ts";

const CROPS_BORDERS = {
  "omnileaf.readerSettings.all": JSON.stringify({ cropsBorders: true }),
};
const STRIP_WIDTH = 800;
const STRIP_HEIGHT = 2400;

function stripBackend(opening: WireOpening = NOT_STARTED): FakeBackend {
  return {
    ...readerBackend(DEFAULT_BACKEND, opening),
    openBook: () => {
      const book = readerBook(opening);
      return {
        ...book,
        pages: book.pages.map((page) => ({
          ...page,
          size: { width: STRIP_WIDTH, height: STRIP_HEIGHT },
        })),
      };
    },
  };
}

async function openBook(
  page: Page,
  stored: Record<string, string> = {},
): Promise<void> {
  await page.addInitScript(
    (entries) => {
      localStorage.setItem("omnileaf.readerGuide.leftToRight", "seen");
      localStorage.setItem("omnileaf.readerGuide.strip", "seen");
      localStorage.setItem(`omnileaf.stripFound.${entries.series}`, "seen");
      for (const [key, value] of Object.entries(entries.stored)) {
        localStorage.setItem(key, value);
      }
    },
    { stored, series: BOOK_SERIES_ID },
  );
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
}

async function openSettings(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
}

function cropSwitch(page: Page): Locator {
  return page.getByRole("switch", { name: "Crop white borders", exact: true });
}

function shownPage(page: Page, number: number): Locator {
  return page.locator(`img[alt="Page ${String(number)}"]:not([aria-hidden])`);
}

function stripPage(page: Page, number: number): Locator {
  return page
    .locator("[data-strip]")
    .getByRole("img", { name: `Page ${String(number)}`, exact: true });
}

test.describe("the paged reader", () => {
  test.use({ backend: readerBackend(DEFAULT_BACKEND) });

  test("turns Crop white borders on and keeps it on the next time a book opens", async ({
    page,
  }) => {
    await openBook(page);
    await openSettings(page);
    await expect(cropSwitch(page)).toBeEnabled();

    await cropSwitch(page).click();
    await page.reload();
    await openSettings(page);

    await expect(cropSwitch(page)).toBeChecked();
  });

  test("shows each page with its borders cropped once Crop white borders turns on", async ({
    page,
  }) => {
    await openBook(page);
    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0$/);
    await openSettings(page);

    await cropSwitch(page).click();

    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0\/cropped$/);
  });

  test("never draws a page with all its borders cropped in the long strip it switches to", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);
    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0\/cropped$/);
    await page.evaluate(() => {
      new MutationObserver(() => {
        for (const image of document.querySelectorAll("[data-strip] img")) {
          if (image.getAttribute("src")?.endsWith("/cropped") === true) {
            document.documentElement.dataset.stripDrewBorders = "";
          }
        }
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
      });
    });
    await openSettings(page);

    await page
      .getByRole("combobox", { name: "Reading mode" })
      .selectOption({ label: "Long strip" });

    await expect(stripPage(page, 1)).toHaveAttribute(
      "src",
      /\/0\/sides-cropped$/,
    );
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-strip-drew-borders",
    );
  });

  test("keeps a page on screen while it switches to the long strip and back with Crop white borders on", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);
    await expect(shownPage(page, 1)).not.toHaveClass(/invisible/);
    await page.evaluate(() => {
      new MutationObserver(() => {
        if (
          document.querySelector("[data-strip] img, [data-shown-page] img") ===
          null
        ) {
          document.documentElement.dataset.readerWentBlank = "";
        }
      }).observe(document.body, { subtree: true, childList: true });
    });
    await openSettings(page);
    const mode = page.getByRole("combobox", { name: "Reading mode" });

    await mode.selectOption({ label: "Long strip" });
    await expect(stripPage(page, 1)).toHaveAttribute(
      "src",
      /\/0\/sides-cropped$/,
    );
    await mode.selectOption({ label: "Left to right" });

    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0\/cropped$/);
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-reader-went-blank",
    );
  });

  test("opens on the page with its borders cropped when Crop white borders is on", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);

    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0\/cropped$/);
    await expect(shownPage(page, 1)).not.toHaveClass(/invisible/);
  });
});

test.describe("when the core can't crop the pages", () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND),
      croppedPagePaths: () => {
        throw new CommandFailure({
          code: "internal",
          message: "read a page path the library didn't give out",
        });
      },
    },
  });

  test("shows the whole page instead", async ({ page }) => {
    await openBook(page, CROPS_BORDERS);

    await expect(shownPage(page, 1)).toHaveAttribute("src", /\/0$/);
    await expect(shownPage(page, 1)).not.toHaveClass(/invisible/);
  });
});

test.describe("the long strip", () => {
  test.use({ backend: stripBackend() });

  test("crops only the sides of each page, by one amount for the book", async ({
    page,
  }) => {
    await openBook(page, CROPS_BORDERS);

    await expect(stripPage(page, 1)).toHaveAttribute(
      "src",
      /\/0\/sides-cropped$/,
    );
  });
});

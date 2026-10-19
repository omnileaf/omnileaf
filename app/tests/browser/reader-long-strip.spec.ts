import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_SERIES_ID,
  BOOK_ID,
  BOOK_TITLE,
  NOT_STARTED,
  PAGE_COUNT,
  readerBackend,
  readerBook,
  servePages,
  type WireOpening,
} from "./reader-book.ts";

const STRIP_WIDTH = 800;
const STRIP_HEIGHT = 2400;
const SCREEN_SHARE = 0.8;
const CLOSE_PX = 4;
const STARTED_ON_14: WireOpening = {
  reading: { state: "started", page: 14 },
  startPage: 13,
};

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

function strip(page: Page): Locator {
  return page.locator("[data-strip]");
}

function slider(page: Page): Locator {
  return page.getByRole("slider", { name: "Page" });
}

function stripPage(page: Page, number: number): Locator {
  return strip(page).getByRole("img", {
    name: `Page ${String(number)}`,
    exact: true,
  });
}

async function openStrip(page: Page, stored: Record<string, string> = {}) {
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

async function scrollTopOf(page: Page): Promise<number> {
  return strip(page).evaluate((element) => element.scrollTop);
}

async function heightOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("not on screen");
  }
  return box.height;
}

async function expectOnPage(page: Page, number: number): Promise<void> {
  await expect(slider(page)).toHaveAttribute(
    "aria-valuetext",
    `Page ${String(number)} of ${String(PAGE_COUNT)}`,
  );
}

test.describe("a book of tall pages", () => {
  test.use({ backend: stripBackend() });

  test("opens as a long strip, its pages edge to edge", async ({ page }) => {
    await openStrip(page);

    await expect(strip(page)).toBeVisible();
    const first = await stripPage(page, 1).boundingBox();
    const second = await stripPage(page, 2).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (first !== null && second !== null) {
      expect(Math.abs(first.y + first.height - second.y)).toBeLessThan(1);
    }
  });

  test("says which page the middle of the screen is on as the strip scrolls", async ({
    page,
  }) => {
    await openStrip(page);
    const pageHeight = await heightOf(stripPage(page, 1));

    const middle = await strip(page).evaluate((element, height) => {
      element.scrollTop = height * 9.2;
      return element.scrollTop + element.clientHeight / 2;
    }, pageHeight);

    await expectOnPage(page, Math.floor(middle / pageHeight) + 1);
  });

  test("scrolls most of a screen down from the bottom of the screen and back up from the top", async ({
    page,
  }) => {
    await openStrip(page);
    const screen = await strip(page).evaluate(
      (element) => element.clientHeight,
    );

    await page.getByRole("button", { name: "Scroll down" }).click();
    await expect
      .poll(() => scrollTopOf(page))
      .toBeGreaterThan(screen * SCREEN_SHARE - CLOSE_PX);
    await page.getByRole("button", { name: "Scroll up" }).click();
    await expect.poll(() => scrollTopOf(page)).toBeLessThan(CLOSE_PX);
  });

  test("scrolls down with the down arrow", async ({ page }) => {
    await openStrip(page);

    await page.keyboard.press("ArrowDown");

    await expect.poll(() => scrollTopOf(page)).toBeGreaterThan(CLOSE_PX);
  });

  test("shows what's up next on scrolling on from the bottom of the strip", async ({
    page,
  }) => {
    await openStrip(page);
    await strip(page).evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expectOnPage(page, PAGE_COUNT);

    await page.keyboard.press("ArrowDown");

    await expect(
      page.getByRole("heading", { level: 2, name: `${BOOK_TITLE} finished` }),
    ).toBeVisible();
  });

  test("scrolls to a page chosen on the slider", async ({ page }) => {
    await openStrip(page);
    const pageHeight = await heightOf(stripPage(page, 1));
    await slider(page).focus();

    await page.keyboard.press("End");

    await expectOnPage(page, PAGE_COUNT);
    await expect
      .poll(() => scrollTopOf(page))
      .toBeGreaterThan(pageHeight * (PAGE_COUNT - 2));
  });

  test("leaves the page layout and direction out of its controls", async ({
    page,
  }) => {
    await openStrip(page);

    await expect(
      page.getByRole("group", { name: "Quick settings" }),
    ).toHaveCount(0);
  });

  test("pages through it once a direction is chosen for the series", async ({
    page,
  }) => {
    await openStrip(page, {
      [`omnileaf.readingDirection.${BOOK_SERIES_ID}`]: "leftToRight",
    });

    await expect(page.locator('img[alt="Page 1"]')).toBeVisible();
    await expect(strip(page)).toHaveCount(0);
  });

  test("blanks each page, naming it, in Screenshot mode", async ({ page }) => {
    await openStrip(page, {
      "omnileaf.screenshotMode": JSON.stringify({
        activity: { kind: "on" },
        options: {
          blankReaderPages: true,
          showLabel: true,
          turnOffAfterAnHour: false,
        },
      }),
    });

    await expect(
      strip(page).getByRole("img", {
        name: `Page 1 of ${String(PAGE_COUNT)}`,
      }),
    ).toBeVisible();
    await expect(strip(page).locator("img")).toHaveCount(0);
  });
});

test.describe("a long strip read before", () => {
  test.use({ backend: stripBackend(STARTED_ON_14) });

  test("opens at the top of the page reading reached", async ({ page }) => {
    await openStrip(page);
    const pageHeight = await heightOf(stripPage(page, 1));

    await expectOnPage(page, 14);
    await expect
      .poll(async () => Math.abs((await scrollTopOf(page)) - pageHeight * 13))
      .toBeLessThan(CLOSE_PX);
  });
});

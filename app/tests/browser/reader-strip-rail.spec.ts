import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, onPlatform, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  NOT_STARTED,
  readerBook,
  servePages,
} from "./reader-book.ts";

const CLOSE_PX = 6;
const SCRUBBER_SIDE_GAP_PX = 8;

function tallPages(base: FakeBackend, bookmarked: number[] | null = null) {
  return {
    ...base,
    openBook: () => {
      const book = readerBook(NOT_STARTED);
      return {
        ...book,
        bookmarkedPages: bookmarked,
        pages: book.pages.map((page) => ({
          ...page,
          size: { width: 800, height: 2400 },
        })),
      };
    },
  } satisfies FakeBackend;
}

async function openStrip(page: Page): Promise<void> {
  await page.addInitScript((series) => {
    localStorage.setItem(`omnileaf.stripFound.${series}`, "seen");
    localStorage.setItem("omnileaf.readerGuide.strip", "seen");
  }, BOOK_SERIES_ID);
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(page.locator("[data-strip]")).toBeVisible();
}

function rail(page: Page): Locator {
  return page.locator("[data-strip-rail]");
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("not on screen");
  }
  return box;
}

test.describe("on a desktop", () => {
  test.use({ backend: tallPages(DEFAULT_BACKEND, [14]) });

  test("shows where the strip is on a rail at the window's right edge", async ({
    page,
  }) => {
    await openStrip(page);
    await expect(rail(page)).toBeVisible();
    const track = await boxOf(rail(page));
    const viewport = page.viewportSize();
    expect(track.x + track.width).toBeGreaterThan((viewport?.width ?? 0) - 48);

    await page.locator("[data-strip]").evaluate((element) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
    });

    await expect
      .poll(async () => {
        const thumb = await boxOf(rail(page).locator("[data-rail-thumb]"));
        return Math.abs(
          thumb.y + thumb.height / 2 - (track.y + track.height / 2),
        );
      })
      .toBeLessThan(CLOSE_PX);
  });

  test("scrolls the strip as its rail is dragged", async ({ page }) => {
    await openStrip(page);
    const track = await boxOf(rail(page));
    const thumb = await boxOf(rail(page).locator("[data-rail-thumb]"));

    await page.mouse.move(
      thumb.x + thumb.width / 2,
      thumb.y + thumb.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(thumb.x + thumb.width / 2, track.y + track.height, {
      steps: 6,
    });
    await page.mouse.up();

    const isAtEnd = await page
      .locator("[data-strip]")
      .evaluate(
        (element) =>
          element.scrollTop + element.clientHeight >= element.scrollHeight - 2,
      );
    expect(isAtEnd).toBe(true);
  });

  test("marks a bookmarked page on the rail", async ({ page }) => {
    await openStrip(page);

    await expect(rail(page).locator("[data-rail-tick]")).toHaveCount(1);
  });
});

test.describe("on a phone", () => {
  test.use({ backend: tallPages(onPlatform("android").backend) });

  test("leaves the rail out", async ({ page }) => {
    await openStrip(page);

    await expect(rail(page)).toBeHidden();
  });

  test(
    "runs Android's page slider down the right edge instead of along the bottom bar",
    { tag: "@native" },
    async ({ page, platform }) => {
      test.skip(platform !== "android", "Android's vertical page slider");
      await openStrip(page);
      const scrubber = page.locator("[data-scrubber]");

      await expect(scrubber).toBeVisible();
      await expect(page.locator("input[type=range]")).toHaveCount(0);
      const track = await boxOf(scrubber);
      const viewport = page.viewportSize();
      expect(track.x + track.width).toBeCloseTo(
        (viewport?.width ?? 0) - SCRUBBER_SIDE_GAP_PX,
        0,
      );

      await page.mouse.move(track.x + track.width / 2, track.y + 20);
      await page.mouse.down();
      await page.mouse.move(track.x + track.width / 2, track.y + track.height, {
        steps: 6,
      });
      await page.mouse.up();

      const isAtEnd = await page
        .locator("[data-strip]")
        .evaluate(
          (element) =>
            element.scrollTop + element.clientHeight >=
            element.scrollHeight - 2,
        );
      expect(isAtEnd).toBe(true);
      await expect(scrubber.locator("[data-scrubber-count]")).toContainText(
        /\d+ \/ \d+/,
      );
    },
  );
});

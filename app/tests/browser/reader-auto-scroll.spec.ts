import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, onPlatform, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  NOT_STARTED,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const LOOK_KEY = "omnileaf.readerSettings.all";
const HALF_A_MINUTE_MS = 30_000;
const SIX_SECONDS_MS = 6000;
const FEW_SECONDS_MS = 2000;
const CLOSE_PX = 8;

function tallPages(secondsPerPage: number | null): FakeBackend {
  return {
    ...readerBackend(DEFAULT_BACKEND),
    openBook: () => {
      const book = readerBook(NOT_STARTED);
      return {
        ...book,
        secondsPerPage,
        pages: book.pages.map((page) => ({
          ...page,
          size: { width: 800, height: 2400 },
        })),
      };
    },
  };
}

async function openStrip(page: Page, look: object = {}): Promise<void> {
  await page.clock.install();
  await page.addInitScript(
    ({ series, lookKey, lookValue }) => {
      localStorage.setItem(`omnileaf.stripFound.${series}`, "seen");
      localStorage.setItem("omnileaf.readerGuide.strip", "seen");
      localStorage.setItem(lookKey, lookValue);
    },
    {
      series: BOOK_SERIES_ID,
      lookKey: LOOK_KEY,
      lookValue: JSON.stringify(look),
    },
  );
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(page.locator("[data-strip]")).toBeVisible();
}

function bar(page: Page): Locator {
  return page.getByRole("region", { name: "Auto scroll" });
}

async function startAutoScroll(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Show the controls" }).click();
  await page.getByRole("button", { name: "Start auto scroll" }).click();
  await expect(bar(page)).toBeVisible();
}

async function scrollTopOf(page: Page): Promise<number> {
  return page.locator("[data-strip]").evaluate((element) => element.scrollTop);
}

async function pageHeightOf(page: Page): Promise<number> {
  return page
    .locator("[data-strip]")
    .getByRole("img", { name: "Page 1", exact: true })
    .evaluate((element) => element.getBoundingClientRect().height);
}

test.describe("at a set speed", () => {
  test.use({ backend: tallPages(null) });

  test("scrolls a fifth of a page in six seconds at 2 pages a minute", async ({
    page,
  }) => {
    await openStrip(page);
    const height = await pageHeightOf(page);
    await startAutoScroll(page);
    await expect(bar(page)).toContainText("2 pages a minute");
    const start = await scrollTopOf(page);

    await page.clock.runFor(SIX_SECONDS_MS);

    expect(
      Math.abs((await scrollTopOf(page)) - start - height / 5),
    ).toBeLessThan(CLOSE_PX);
  });

  test("pauses on a touch of the page, until Play", async ({ page }) => {
    await openStrip(page);
    await startAutoScroll(page);

    await page.getByRole("button", { name: "Scroll down" }).click();

    await expect(bar(page)).toContainText("Paused");
    const paused = await scrollTopOf(page);
    await page.clock.runFor(FEW_SECONDS_MS);
    expect(await scrollTopOf(page)).toBe(paused);
    await bar(page).getByRole("button", { name: "Play" }).click();
    await page.clock.runFor(FEW_SECONDS_MS);
    expect(await scrollTopOf(page)).toBeGreaterThan(paused);
  });

  test("pauses and goes on with Space", async ({ page }) => {
    await openStrip(page);
    await startAutoScroll(page);

    await page.keyboard.press(" ");
    await expect(bar(page)).toContainText("Paused");
    await expect(bar(page)).toContainText("Space resumes");
    await page.keyboard.press(" ");

    await expect(bar(page)).toContainText("Space pauses");
  });

  test("goes faster and slower half a page a minute at a time", async ({
    page,
  }) => {
    await openStrip(page);
    await startAutoScroll(page);

    await bar(page).getByRole("button", { name: "Faster" }).click();
    await expect(bar(page)).toContainText("2.5 pages a minute");
    await bar(page).getByRole("button", { name: "Slower" }).click();
    await bar(page).getByRole("button", { name: "Slower" }).click();

    await expect(bar(page)).toContainText("1.5 pages a minute");
    const stored = await page.evaluate(
      (key) => localStorage.getItem(key),
      LOOK_KEY,
    );
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ pagesPerMinute: 1.5 });
  });

  test("keeps scrolling with reduced motion, since you started it", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStrip(page);
    await startAutoScroll(page);
    const start = await scrollTopOf(page);

    await page.clock.runFor(FEW_SECONDS_MS);

    expect(await scrollTopOf(page)).toBeGreaterThan(start);
  });

  test("pauses at the end of a book", async ({ page }) => {
    await openStrip(page);
    await page.locator("[data-strip]").evaluate((element) => {
      element.scrollTop = element.scrollHeight - element.clientHeight - 20;
    });
    await startAutoScroll(page);

    await page.clock.runFor(HALF_A_MINUTE_MS);

    await expect(bar(page)).toContainText("Paused");
  });
});

test.describe("once the library knows the reading speed", () => {
  test.use({ backend: tallPages(60) });

  test("scrolls at my pace once it's chosen", async ({ page }) => {
    await openStrip(page, { autoScrollSpeed: "myPace" });

    await startAutoScroll(page);

    await expect(bar(page)).toContainText("Your pace");
    await expect(bar(page)).not.toContainText("pages a minute");
  });
});

test.describe("on an Android phone", () => {
  test.use({
    backend: {
      ...onPlatform("android").backend,
      openBook: tallPages(60).openBook,
    },
  });

  test("says my pace's speed while it runs, and to tap Play once paused", async ({
    page,
  }) => {
    await openStrip(page, { autoScrollSpeed: "myPace" });
    await startAutoScroll(page);
    await expect(bar(page)).toContainText("About 1 page a minute");

    await page.getByRole("button", { name: "Scroll down" }).click();

    await expect(bar(page)).toContainText("Tap Play to resume");
  });
});

test.describe("its settings", () => {
  test.use({ backend: tallPages(null) });

  test("sets the speed and the pause at the end of a book in the long strip's Reading settings", async ({
    page,
  }) => {
    await openStrip(page);
    await page.getByRole("button", { name: "Show the controls" }).click();
    await page
      .getByRole("button", { name: "Reading settings", exact: true })
      .click();
    const autoScroll = page.getByRole("region", { name: "Auto scroll" });

    await expect(
      autoScroll.getByText(
        "Keeps scrolling with reduced motion on, since you started it.",
      ),
    ).toBeVisible();
    await expect(
      autoScroll.getByRole("slider", { name: "Pages a minute" }),
    ).toBeVisible();
    await autoScroll
      .getByRole("switch", { name: "Pause auto scroll at the end of a book" })
      .click();

    const stored = await page.evaluate(
      (key) => localStorage.getItem(key),
      LOOK_KEY,
    );
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ pausesAtEnd: false });
  });
});

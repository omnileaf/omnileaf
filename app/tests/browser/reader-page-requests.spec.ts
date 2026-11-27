import type { Locator, Page, Request, Route } from "@playwright/test";

import {
  LONGEST_IMAGE_LOAD_MS,
  PAGES_LOADING_AT_ONCE,
} from "../../src/lib/reader/page-requests.ts";
import { fakeProtocolRoute } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, framesPassed, test } from "./fixtures.ts";
import { Traffic } from "./page-traffic.ts";
import {
  AS_ANDROID_SERVES,
  BOOK_ID,
  BOOK_TITLE,
  pageIndexOf,
  readerBackend,
  servePages,
} from "./reader-book.ts";

const SCREENSHOT_MODE_SHORTCUT = "Control+Shift+H";
const FIRST_PAGE = 0;
const HELD_PAGES = [1, 2, 3];

test.use({ backend: readerBackend(DEFAULT_BACKEND) });

function pageImage(page: Page, number: number): Locator {
  return page.getByRole("img", { name: `Page ${String(number)}`, exact: true });
}

function tryAgain(page: Page): Locator {
  return page.getByRole("button", { name: "Try again" });
}

async function openBook(page: Page): Promise<void> {
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

interface HeldPages {
  readonly traffic: Traffic;
  readonly letFirstPageThrough: () => void;
  readonly answerHeldPages: () => void;
}

async function failFirstPageAndHoldNext(page: Page): Promise<HeldPages> {
  const traffic = new Traffic();
  let isFirstPageFailing = true;
  let answer: () => void = () => {};
  const answered = new Promise<void>((done) => {
    answer = done;
  });
  page.on("requestfinished", (request: Request) => {
    traffic.settle(request);
  });
  page.on("requestfailed", (request: Request) => {
    traffic.settle(request);
  });
  await servePages(page, undefined, AS_ANDROID_SERVES);
  await page.route(fakeProtocolRoute("omni"), async (route: Route) => {
    const index = pageIndexOf(route.request().url());
    if (index === undefined) {
      await route.fallback();
      return;
    }
    traffic.start(route.request(), index);
    if (index === FIRST_PAGE && isFirstPageFailing) {
      await route.fulfill({ status: 500 });
      return;
    }
    if (HELD_PAGES.includes(index)) {
      await answered;
    }
    await route.fallback();
  });
  return {
    traffic,
    letFirstPageThrough: () => {
      isFirstPageFailing = false;
    },
    answerHeldPages: () => {
      answer();
    },
  };
}

test("asks for a page tried again only once there is room, and first", async ({
  page,
}) => {
  const held = await failFirstPageAndHoldNext(page);
  await openBook(page);
  await expect(tryAgain(page)).toBeVisible();
  held.letFirstPageThrough();

  await tryAgain(page).click();
  await framesPassed(page);

  expect(held.traffic.inFlight).toBeLessThanOrEqual(PAGES_LOADING_AT_ONCE);
  held.answerHeldPages();
  await expect(pageImage(page, 1)).toBeVisible();
  expect(held.traffic.most).toBeLessThanOrEqual(PAGES_LOADING_AT_ONCE);
});

test("says a page that never arrives couldn't be shown, and offers to try again", async ({
  page,
}) => {
  await page.clock.install();
  await servePages(page, async (_, index) => {
    if (index === FIRST_PAGE) {
      await new Promise(() => {});
    }
  });
  await openBook(page);

  await page.clock.fastForward(LONGEST_IMAGE_LOAD_MS);

  await expect(page.getByText("This page couldn't be shown.")).toBeVisible();
  await expect(tryAgain(page)).toBeVisible();
});

test("shows the page again once blank pages are turned off", async ({
  page,
}) => {
  await servePages(page);
  await openBook(page);
  await expect(pageImage(page, 1)).toBeVisible();

  await page.keyboard.press(SCREENSHOT_MODE_SHORTCUT);
  await expect(page.locator('main img[alt="Page 1"]')).toHaveCount(0);
  await page.keyboard.press(SCREENSHOT_MODE_SHORTCUT);

  await expect(pageImage(page, 1)).toBeVisible();
});

import type { Page } from "@playwright/test";

import { PAGES_LOADING_AT_ONCE } from "../../src/lib/reader/page-requests.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  framesPassed,
  test,
} from "./fixtures.ts";
import { servePagesSlowly } from "./page-traffic.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  markStripSeen,
  NOT_STARTED,
  readerBook,
  tallStripBook,
} from "./reader-book.ts";

const LONG_BOOK_PAGES = 200;
const SHORT_BOOK_PAGES = 60;
const WIDE_PAGE = { width: 2700, height: 1800 };
const PAGE_TO_SCROLL_TO = 40;
const SCROLLS_UP = 6;
const SCREEN_SHARE_PER_SCROLL = 0.25;
const SCREENSHOT_MODE_SHORTCUT = "Control+Shift+H";
const RAIL_STEPS = 6;
const RAIL_MIDDLE = 0.5;
const READ_AHEAD_PAST_THE_SCREEN = 2;

interface PagesOnScreen {
  readonly indices: readonly number[];
  readonly loaded: boolean;
  readonly aboveIndex: number | undefined;
}

function pagesOnScreen(page: Page): Promise<PagesOnScreen> {
  return page.locator("[data-strip]").evaluate((strip) => {
    const view = strip.getBoundingClientRect();
    const images = [
      ...strip.querySelectorAll<HTMLImageElement>('img[alt^="Page "]'),
    ];
    const indexOf = (image: HTMLImageElement): number =>
      Number(/Page (\d+)/.exec(image.alt)?.[1]) - 1;
    const onScreen = images.filter((image) => {
      const box = image.getBoundingClientRect();
      return box.bottom > view.top && box.top < view.bottom;
    });
    const above = images.filter(
      (image) => image.getBoundingClientRect().bottom <= view.top,
    );
    const lastAbove = above.at(-1);
    return {
      indices: onScreen.map(indexOf),
      loaded: onScreen.every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
      aboveIndex: lastAbove === undefined ? undefined : indexOf(lastAbove),
    };
  });
}

async function scrollStripTo(page: Page, index: number): Promise<void> {
  await page.locator("[data-strip]").evaluate((strip, at) => {
    const target = strip.querySelectorAll<HTMLElement>("img")[at];
    strip.scrollTop = target?.parentElement?.offsetTop ?? 0;
  }, index);
}

async function scrollStripUp(page: Page): Promise<void> {
  for (let scroll = 0; scroll < SCROLLS_UP; scroll += 1) {
    await page.locator("[data-strip]").evaluate((strip, share) => {
      strip.scrollTop -= strip.clientHeight * share;
    }, SCREEN_SHARE_PER_SCROLL);
    await framesPassed(page);
  }
}

async function expectScreenLoaded(page: Page): Promise<PagesOnScreen> {
  await expect.poll(async () => (await pagesOnScreen(page)).loaded).toBe(true);
  return pagesOnScreen(page);
}

test.describe("a long strip of short pages", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: () => {
        const book = readerBook(NOT_STARTED, SHORT_BOOK_PAGES);
        return {
          ...book,
          pages: book.pages.map((page) => ({ ...page, size: WIDE_PAGE })),
        };
      },
    },
  });

  test("asks for every page on screen and reads ahead upwards while scrolling up", async ({
    page,
  }) => {
    await markStripSeen(page, {
      [`omnileaf.readingDirection.${BOOK_SERIES_ID}`]: "longStrip",
    });
    const traffic = await servePagesSlowly(page);
    await page.goto(`/read/${BOOK_ID}`);
    await expectScreenLoaded(page);
    await scrollStripTo(page, PAGE_TO_SCROLL_TO);
    await expectScreenLoaded(page);

    await scrollStripUp(page);

    const shown = await expectScreenLoaded(page);
    expect(shown.aboveIndex).toBeDefined();
    await expect
      .poll(() => traffic.pages.asked.includes(shown.aboveIndex ?? -1))
      .toBe(true);
    expect(traffic.pages.most).toBeLessThanOrEqual(PAGES_LOADING_AT_ONCE);
  });
});

test.describe("a long strip of tall pages", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: () => tallStripBook(null, LONG_BOOK_PAGES),
    },
  });

  async function openStrip(page: Page) {
    await markStripSeen(page);
    const traffic = await servePagesSlowly(page);
    await page.goto(`/read/${BOOK_ID}`);
    await expectScreenLoaded(page);
    return traffic;
  }

  test("reads ahead again once a drag of the rail is cancelled", async ({
    page,
  }) => {
    const traffic = await openStrip(page);
    const rail = page.locator("[data-strip-rail]");
    test.skip(!(await rail.isVisible()), "the rail shows on a desktop");
    const track = await boxOf(rail);
    const thumb = await boxOf(rail.locator("[data-rail-thumb]"));
    await page.mouse.move(
      thumb.x + thumb.width / 2,
      thumb.y + thumb.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      thumb.x + thumb.width / 2,
      track.y + track.height * RAIL_MIDDLE,
      { steps: RAIL_STEPS },
    );

    await rail.dispatchEvent("pointercancel");

    const shown = await expectScreenLoaded(page);
    const lastOnScreen = Math.max(...shown.indices);
    await expect
      .poll(() =>
        traffic.pages.asked.includes(lastOnScreen + READ_AHEAD_PAST_THE_SCREEN),
      )
      .toBe(true);
  });

  test("asks again a few pages at a time once blank pages are turned off", async ({
    page,
  }) => {
    const traffic = await openStrip(page);
    await scrollStripTo(page, LONG_BOOK_PAGES / 2);
    await expectScreenLoaded(page);

    await page.keyboard.press(SCREENSHOT_MODE_SHORTCUT);
    await expect(page.locator('[data-strip] img[alt^="Page "]')).toHaveCount(0);
    await page.keyboard.press(SCREENSHOT_MODE_SHORTCUT);

    await expectScreenLoaded(page);
    expect(traffic.pages.most).toBeLessThanOrEqual(PAGES_LOADING_AT_ONCE);
  });
});

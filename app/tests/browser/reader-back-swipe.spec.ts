import type { Page } from "@playwright/test";

import type { BackSwipe, SwipeEdge } from "../../src/lib/ipc/bindings.ts";
import type { FakeChannel } from "./fake-backend.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { NOT_STARTED, pinchTo, readerBook, servePages } from "./reader-book.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const READER_URL = /\/read\//;
const SERIES_URL = new RegExp(`/series/${SERIES_ID}$`);
const HALFWAY = 0.5;
const PAST_HALFWAY = 0.7;
const BEFORE_HALFWAY = 0.3;
const TABLET = { width: 820, height: 1180 };
const WATCHED_BY_SERIES_AND_READER = 2;
const WATCHED_AGAIN_BY_THE_SERIES = 3;
const FLICK = 1;
const LIBRARY_URL = /\/$/;
const LATE_CALL_MS = 300;
const SHORT_VIEWPORT = { width: 390, height: 300 };
const PHONE_SIDEWAYS = { width: 844, height: 390 };
const SMALL_PHONE_SIDEWAYS = { width: 700, height: 390 };

const UNREAD = { state: "notStarted" } as const;
const shelf = new FakeShelf([UNREAD, UNREAD, UNREAD]);
const watched: FakeChannel<BackSwipe>[] = [];
const allowedEdges: (SwipeEdge | null)[] = [];
let whileSeriesLoads: (() => Promise<void>) | undefined;
let booksOpened = 0;

const BACKEND = {
  ...DEFAULT_BACKEND,
  seriesOverview: async (id) => {
    await whileSeriesLoads?.();
    return shelf.backend().seriesOverview(id);
  },
  seriesBooks: (id, listing, after) =>
    shelf.backend().seriesBooks(id, listing, after),
  openBook: (id) => {
    booksOpened += 1;
    return {
      ...readerBook(NOT_STARTED),
      id,
      series: SERIES_ID,
      seriesTitle: SERIES_TITLE,
    };
  },
  watchBackSwipes: (channel) => {
    watched.push(channel);
    return null;
  },
  allowBackSwipe: (edge) => {
    allowedEdges.push(edge);
    return null;
  },
} satisfies typeof DEFAULT_BACKEND;

test.use({ backend: BACKEND });

test.beforeEach(() => {
  watched.length = 0;
  allowedEdges.length = 0;
  whileSeriesLoads = undefined;
});

function readerScreen(page: Page) {
  return page.getByRole("main");
}

async function swipe(...steps: readonly BackSwipe[]): Promise<void> {
  await expect.poll(() => watched.length).toBe(WATCHED_BY_SERIES_AND_READER);
  for (const step of steps) {
    await watched.at(-1)?.send(step);
  }
}

async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(resolve);
      }),
  );
}

function previousScreen(page: Page) {
  return page.locator("[data-previous-screen] > div").first();
}

function dimming(page: Page) {
  return page.locator("[data-previous-screen] > div").last();
}

async function openBookFromItsSeries(
  page: Page,
  direction: "ltr" | "rtl" = "ltr",
): Promise<void> {
  await servePages(page);
  await page.goto(`/series/${SERIES_ID}`);
  const firstBook = page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`${SERIES_TITLE} v01`) })
    .first();
  await expect(firstBook).toBeVisible();
  await page.evaluate((dir) => {
    document.documentElement.dir = dir;
  }, direction);
  await firstBook.click();
  await expect(page).toHaveURL(READER_URL);
  await expect(readerScreen(page)).toBeVisible();
}

test.describe("swiping back from the reader", { tag: "@native" }, () => {
  test("takes a swipe from the left edge on an iPhone", async ({
    page,
    platform,
  }) => {
    await openBookFromItsSeries(page);

    await expect
      .poll(() => allowedEdges.at(-1))
      .toBe(platform === "ios" ? "left" : undefined);
  });

  test("moves the book with the finger and brings the series in from a fifth behind", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);
    const start = await boxOf(readerScreen(page));

    await swipe({ kind: "moved", progress: HALFWAY });

    await expect
      .poll(async () => (await boxOf(readerScreen(page))).x - start.x)
      .toBeCloseTo(start.width * HALFWAY, 0);
    await expect(previousScreen(page)).toContainText(SERIES_TITLE);
    expect((await boxOf(previousScreen(page))).x - start.x).toBeCloseTo(
      -start.width * 0.1,
      0,
    );
    await expect(dimming(page)).toHaveCSS("opacity", "0.125");
  });

  test("lands on the series when let go past halfway", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);

    await swipe(
      { kind: "moved", progress: PAST_HALFWAY },
      { kind: "released", progress: PAST_HALFWAY, velocity: 0 },
    );

    await expect(page).toHaveURL(SERIES_URL);
    await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
  });

  test("springs back into the book when let go before halfway", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);
    const start = await boxOf(readerScreen(page));

    await swipe(
      { kind: "moved", progress: BEFORE_HALFWAY },
      { kind: "released", progress: BEFORE_HALFWAY, velocity: 0 },
    );

    await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
    await expect(page).toHaveURL(READER_URL);
    expect((await boxOf(readerScreen(page))).x).toBe(start.x);
  });

  test("leaves the series in place when motion is reduced", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openBookFromItsSeries(page);
    const start = await boxOf(readerScreen(page));

    await swipe({ kind: "moved", progress: HALFWAY });

    await expect(previousScreen(page)).toContainText(SERIES_TITLE);
    expect((await boxOf(previousScreen(page))).x).toBe(start.x);
  });

  test("lets a zoomed page pan instead of going back", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);
    await expect.poll(() => allowedEdges.at(-1)).toBe("left");

    await page.keyboard.press("Meta+=");

    await expect.poll(() => allowedEdges.at(-1)).toBeNull();

    await page.keyboard.press("Meta+0");

    await expect.poll(() => allowedEdges.at(-1)).toBe("left");
  });

  test("shows the zoom badge exactly while a pinched page holds the swipe", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);
    const badge = page.getByText(/ to fit$/);
    await expect.poll(() => allowedEdges.at(-1)).toBe("left");
    await expect(badge).toBeHidden();

    await pinchTo(page, 2);

    await expect.poll(() => allowedEdges.at(-1)).toBeNull();
    await expect(badge).toHaveText("200% · Double-tap to fit");

    await pinchTo(page, 1);

    await expect.poll(() => allowedEdges.at(-1)).toBe("left");
    await expect(badge).toBeHidden();
  });

  test("goes back from the series with a swipe once it lands there", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);
    await swipe(
      { kind: "moved", progress: PAST_HALFWAY },
      { kind: "released", progress: PAST_HALFWAY, velocity: 0 },
    );
    await expect(page).toHaveURL(SERIES_URL);

    await expect.poll(() => allowedEdges.at(-1)).toBe("left");
  });

  test("lands on the series when flicked before halfway", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);

    await swipe(
      { kind: "moved", progress: BEFORE_HALFWAY },
      { kind: "released", progress: BEFORE_HALFWAY, velocity: FLICK },
    );

    await expect(page).toHaveURL(SERIES_URL);
  });

  test("springs back into the book when the swipe is cancelled", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);
    const start = await boxOf(readerScreen(page));

    await swipe({ kind: "moved", progress: HALFWAY }, { kind: "cancelled" });

    await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
    await expect(page).toHaveURL(READER_URL);
    expect((await boxOf(readerScreen(page))).x).toBe(start.x);
  });

  test("takes the next swipe on the series back to the library", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);
    await swipe(
      { kind: "moved", progress: PAST_HALFWAY },
      { kind: "released", progress: PAST_HALFWAY, velocity: 0 },
    );
    await expect(page).toHaveURL(SERIES_URL);
    await expect.poll(() => watched.length).toBe(WATCHED_AGAIN_BY_THE_SERIES);

    await watched.at(-1)?.send({ kind: "moved", progress: PAST_HALFWAY });
    await watched.at(-1)?.send({
      kind: "released",
      progress: PAST_HALFWAY,
      velocity: 0,
    });

    await expect(page).toHaveURL(LIBRARY_URL);
  });

  test("lands on the series scrolled as it showed behind the swipe", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await page.setViewportSize(SHORT_VIEWPORT);
    await servePages(page);
    await page.goto(`/series/${SERIES_ID}`);
    const firstBook = page
      .getByRole("main")
      .getByRole("link", { name: new RegExp(`${SERIES_TITLE} v01`) })
      .first();
    await expect(firstBook).toBeAttached();
    await page.getByRole("main").evaluate((main) => {
      main.scrollTop = main.scrollHeight;
    });
    await firstBook.dispatchEvent("click");
    await expect(page).toHaveURL(READER_URL);

    await swipe({ kind: "moved", progress: PAST_HALFWAY });
    const shownWhileSwiping = await page
      .locator("[data-previous-screen] .contents > div")
      .evaluate((copy) => copy.scrollTop);
    await swipe({ kind: "released", progress: PAST_HALFWAY, velocity: 0 });

    await expect(page).toHaveURL(SERIES_URL);
    expect(shownWhileSwiping).toBeGreaterThan(0);
    await expect
      .poll(() => page.getByRole("main").evaluate((main) => main.scrollTop))
      .toBe(shownWhileSwiping);
  });

  test("puts the book back when the swipe turns off part way", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);
    const start = await boxOf(readerScreen(page));
    await swipe({ kind: "moved", progress: HALFWAY });
    await expect
      .poll(async () => (await boxOf(readerScreen(page))).x)
      .not.toBe(start.x);

    await page.setViewportSize(TABLET);

    await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
    await expect
      .poll(async () => (await boxOf(readerScreen(page))).x)
      .toBe(start.x);
  });

  test("lets the rest of a swipe go once the swipe turns off part way", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);
    await swipe({ kind: "moved", progress: HALFWAY });
    await page.setViewportSize(TABLET);
    await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
    const start = await boxOf(readerScreen(page));

    await swipe(
      { kind: "moved", progress: PAST_HALFWAY },
      { kind: "released", progress: PAST_HALFWAY, velocity: 0 },
    );
    await nextFrame(page);

    await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
    expect((await boxOf(readerScreen(page))).x).toBe(start.x);
    await expect(page).toHaveURL(READER_URL);
  });

  test("puts the book back when the way back to the series goes nowhere", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);
    const start = await boxOf(readerScreen(page));
    whileSeriesLoads = async () => {
      whileSeriesLoads = undefined;
      const openedBefore = booksOpened;
      await page.evaluate(() => {
        const toThisBook = document.createElement("a");
        toThisBook.href = location.pathname;
        document.body.append(toThisBook);
        toThisBook.click();
        toThisBook.remove();
      });
      await expect.poll(() => booksOpened).toBeGreaterThan(openedBefore);
    };

    await swipe(
      { kind: "moved", progress: PAST_HALFWAY },
      { kind: "released", progress: PAST_HALFWAY, velocity: 0 },
    );

    await expect(page).toHaveURL(READER_URL);
    await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
    await expect
      .poll(async () => (await boxOf(readerScreen(page))).x)
      .toBe(start.x);
  });

  test("lets the book move once More turns from a menu into a sheet", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.setViewportSize(SMALL_PHONE_SIDEWAYS);
    await expect(page.getByRole("menu")).toHaveCount(0);
    const start = await boxOf(readerScreen(page));

    await swipe({ kind: "moved", progress: HALFWAY });

    await expect
      .poll(async () => (await boxOf(readerScreen(page))).x)
      .not.toBe(start.x);
  });

  test.describe("in a book read right to left", () => {
    test.use({
      backend: {
        ...BACKEND,
        openBook: (id) => ({
          ...BACKEND.openBook(id),
          readingDirection: "rightToLeft",
        }),
      },
    });

    test("leaves the left edge to the drag that turns to the next page", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the edge swipe is the iPhone's");
      await openBookFromItsSeries(page);
      await expect
        .poll(() => watched.length)
        .toBe(WATCHED_BY_SERIES_AND_READER);

      await expect.poll(() => allowedEdges.at(-1)).toBeNull();
    });

    test("lets a swipe from the right edge go back in right-to-left layouts", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the edge swipe is the iPhone's");
      await openBookFromItsSeries(page, "rtl");

      await expect.poll(() => allowedEdges.at(-1)).toBe("right");
    });
  });

  test("leaves the right edge to the drag that turns to the next page in right-to-left layouts", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page, "rtl");
    await expect.poll(() => watched.length).toBe(WATCHED_BY_SERIES_AND_READER);

    await expect.poll(() => allowedEdges.at(-1)).toBeNull();
  });

  test("moves the book the other way once the layout turns right to left", async ({
    page,
    platform,
  }) => {
    test.skip(platform !== "ios", "the edge swipe is the iPhone's");
    await openBookFromItsSeries(page);
    const start = await boxOf(readerScreen(page));
    await swipe({ kind: "moved", progress: HALFWAY }, { kind: "cancelled" });
    await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });

    await swipe({ kind: "moved", progress: HALFWAY });

    await expect
      .poll(async () => (await boxOf(readerScreen(page))).x - start.x)
      .toBeCloseTo(-start.width * HALFWAY, 0);
  });

  for (const { panel, open } of [
    {
      panel: "Jump to a book",
      open: (page: Page) =>
        page
          .getByRole("button", { name: /Jump to a book/ })
          .first()
          .click(),
    },
    {
      panel: "Reading settings",
      open: (page: Page) =>
        page
          .getByRole("button", { name: "Reading settings", exact: true })
          .click(),
    },
    {
      panel: "More",
      open: (page: Page) =>
        page.getByRole("button", { name: "More", exact: true }).click(),
    },
    {
      panel: "Light",
      open: (page: Page) =>
        page
          .getByRole("button", { name: "Light", exact: true })
          .first()
          .click(),
    },
    {
      panel: "reading direction",
      open: (page: Page) =>
        page
          .getByRole("button", { name: /Left to right/ })
          .first()
          .click(),
    },
    {
      panel: "Keyboard shortcuts",
      open: (page: Page) => page.keyboard.press("Shift+?"),
    },
  ]) {
    test(`closes ${panel} first instead of leaving the book`, async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the edge swipe is the iPhone's");
      await openBookFromItsSeries(page);
      await open(page);
      const opened = page.locator('[role="dialog"], [role="menu"]');
      await expect(opened).toBeVisible();

      await swipe(
        { kind: "moved", progress: PAST_HALFWAY },
        { kind: "released", progress: PAST_HALFWAY, velocity: 0 },
      );

      await expect(opened).toHaveCount(0);
      await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
      await expect(page).toHaveURL(READER_URL);
    });

    test(`keeps the book still under ${panel} while the edge is dragged`, async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the edge swipe is the iPhone's");
      await openBookFromItsSeries(page);
      const start = await boxOf(page.locator("main").first());
      await open(page);
      await expect(
        page.locator('[role="dialog"], [role="menu"]'),
      ).toBeVisible();

      await swipe({ kind: "moved", progress: PAST_HALFWAY });
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            requestAnimationFrame(resolve);
          }),
      );

      expect((await boxOf(page.locator("main").first())).x).toBe(start.x);
      await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
    });
  }

  test.describe("when the phone takes the calls out of order", () => {
    let inFlight = 0;

    test.use({
      backend: {
        ...BACKEND,
        allowBackSwipe: async (edge) => {
          inFlight += 1;
          if (edge === null) {
            await new Promise((resolve) => setTimeout(resolve, LATE_CALL_MS));
          }
          allowedEdges.push(edge);
          inFlight -= 1;
          return null;
        },
      },
    });

    test("keeps the swipe on for the book once the series lets it go", async ({
      page,
      platform,
    }) => {
      test.skip(platform !== "ios", "the edge swipe is the iPhone's");
      await openBookFromItsSeries(page);

      await expect
        .poll(() => (inFlight === 0 ? allowedEdges.at(-1) : "sending"))
        .toBe("left");
    });
  });

  test.describe("on an iPhone held sideways", () => {
    test.use({ viewport: PHONE_SIDEWAYS });

    test("takes a swipe from the left edge", async ({ page, platform }) => {
      test.skip(platform !== "ios", "the edge swipe is the iPhone's");
      await openBookFromItsSeries(page);

      await expect.poll(() => allowedEdges.at(-1)).toBe("left");
    });
  });

  test.describe("on a tablet", () => {
    test.use({ viewport: TABLET });

    test("keeps the reader free of the edge swipe", async ({
      page,
      platform,
    }) => {
      await openBookFromItsSeries(page);

      await expect
        .poll(() => allowedEdges.at(-1))
        .toBe(platform === "ios" ? null : undefined);
    });
  });
});

import type { Page } from "@playwright/test";

import type { BackSwipe, InterfaceError } from "../../src/lib/ipc/bindings.ts";
import type { FakeChannel } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, fakeAppInfo, test } from "./fixtures.ts";
import { NOT_STARTED, readerBook, servePages } from "./reader-book.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const READER_URL = /\/read\//;
const SERIES_URL = new RegExp(`/series/${SERIES_ID}$`);
const SCREEN_CORNER_PX = 32;
const HALFWAY = 0.5;
const WATCHED_BY_SERIES_TWICE = 2;
const UNREAD = { state: "notStarted" } as const;
const shelf = new FakeShelf([UNREAD, UNREAD, UNREAD]);
const watched: FakeChannel<BackSwipe>[] = [];
const interfaceErrors: InterfaceError[] = [];

test.use({
  platform: "android",
  backend: {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo("android"),
    seriesOverview: (id) => shelf.backend().seriesOverview(id),
    seriesBooks: (id, listing, after) =>
      shelf.backend().seriesBooks(id, listing, after),
    openBook: (id) => ({
      ...readerBook(NOT_STARTED),
      id,
      series: SERIES_ID,
      seriesTitle: SERIES_TITLE,
    }),
    watchBackSwipes: (channel) => {
      watched.push(channel);
      return null;
    },
    offerInterfaceErrorReport: (error) => {
      interfaceErrors.push(error);
      return { details: error.message, origin: "interface" };
    },
  },
});

test.beforeEach(() => {
  watched.length = 0;
  interfaceErrors.length = 0;
});

function started(): BackSwipe {
  return {
    kind: "started",
    progress: 0,
    edge: "left",
    touchY: HALFWAY,
    corner: SCREEN_CORNER_PX,
  };
}

function moved(progress: number): BackSwipe {
  return {
    kind: "moved",
    progress,
    edge: "left",
    touchY: HALFWAY,
    corner: SCREEN_CORNER_PX,
  };
}

async function watching(): Promise<void> {
  await expect.poll(() => watched.length).toBeGreaterThan(0);
}

async function swipeAsAndroidDoes(...steps: BackSwipe[]): Promise<void> {
  await watching();
  for (const step of steps) {
    await watched.at(-1)?.send(step);
  }
}

async function swipeAtFirstListener(...steps: BackSwipe[]): Promise<void> {
  await watching();
  for (const step of steps) {
    await watched[0]?.send(step);
  }
}

async function openSeries(page: Page): Promise<void> {
  await servePages(page);
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();
}

async function openBook(page: Page): Promise<void> {
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`${SERIES_TITLE} v01`) })
    .first()
    .click();
  await expect(page).toHaveURL(READER_URL);
  await expect(page.getByRole("main")).toBeVisible();
}

test("shows no error, keeps the book and goes back to the series when a back gesture is made in the reader", async ({
  page,
}) => {
  await openSeries(page);
  await openBook(page);

  await swipeAsAndroidDoes(started(), moved(HALFWAY));

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(interfaceErrors).toEqual([]);
  await expect(page).toHaveURL(READER_URL);
  await expect(page.getByRole("main")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(SERIES_URL);
});

test("previews a back gesture again on the series after coming back from the reader", async ({
  page,
}) => {
  await openSeries(page);
  await openBook(page);
  await page.goBack();
  await expect(page).toHaveURL(SERIES_URL);
  await expect.poll(() => watched.length).toBe(WATCHED_BY_SERIES_TWICE);

  await swipeAsAndroidDoes(started(), moved(HALFWAY));

  await expect(page.locator("[data-previous-screen]")).toHaveCount(1);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(interfaceErrors).toEqual([]);
});

test("leaves a gesture sent to the series' first listener without effect after coming back from the reader", async ({
  page,
}) => {
  await openSeries(page);
  await openBook(page);
  await page.goBack();
  await expect(page).toHaveURL(SERIES_URL);
  await expect.poll(() => watched.length).toBe(WATCHED_BY_SERIES_TWICE);

  await swipeAtFirstListener(started(), moved(HALFWAY));

  await expect(page.locator("[data-previous-screen]")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(interfaceErrors).toEqual([]);
});

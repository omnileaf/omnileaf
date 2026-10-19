import type { Page } from "@playwright/test";

import type {
  HistoryEntry,
  IconAction,
  IconActionsMenu,
  Platform,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend, FakeChannel } from "./fake-backend.ts";
import {
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  NOT_STARTED,
  readerBook,
  servePages,
} from "./reader-book.ts";

const TURNED_ON_AT = new Date("2026-10-03T21:14:00Z");
const BACK_AFTER_ITS_HOUR = new Date("2026-10-03T22:19:00Z");
const STARTED_AT_MS = 1_790_000_000_000;

const LAST_BOOK = {
  book: BOOK_ID,
  bookTitle: BOOK_TITLE,
  series: "0190a3e4-0000-8000-8001-000000000001",
  seriesTitle: "Sample Series 01",
  position: 1,
  cover: null,
  startedAtMs: STARTED_AT_MS,
  utcOffsetMinutes: 0,
  readSeconds: 600,
  readTo: { state: "page", page: 14, pageCount: 30 },
  reading: { state: "started", page: 14 },
  day: { day: Math.floor(STARTED_AT_MS / 86_400_000), readSeconds: 600 },
} as HistoryEntry;

const shownMenus: IconActionsMenu[] = [];
const watching: FakeChannel<IconAction>[] = [];

function backendOn(platform: Platform, launchedWith?: IconAction): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo(platform),
    openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
    readingHistory: (_after, of) => ({
      entries: of.kind === "unfinished" ? [LAST_BOOK] : [],
      next: null,
    }),
    showIconActions: (menu) => {
      shownMenus.push(menu);
      return null;
    },
    watchIconActions: async (channel) => {
      watching.push(channel);
      if (launchedWith !== undefined) {
        await channel.send(launchedWith);
      }
      return null;
    },
  };
}

function lastShownMenu(): IconActionsMenu | undefined {
  return shownMenus.at(-1);
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function choose(action: IconAction): Promise<void> {
  await expect.poll(() => watching.length).toBe(1);
  await watching[0]?.send(action);
}

test.beforeEach(() => {
  shownMenus.length = 0;
  watching.length = 0;
});

test.describe("on an Android phone", () => {
  test.use({ backend: backendOn("android") });

  test("gives the icon its shortcuts in the app's words", async ({ page }) => {
    await openLibrary(page);

    await expect.poll(lastShownMenu).toEqual({
      screenshotMode: "Screenshot mode",
      screenshotModeState: "Off",
      screenshotModeWithState: "Screenshot mode · Off",
      continueReading: "Continue reading",
      searchLibrary: "Search the library",
    });
  });

  test("Screenshot mode chosen on the icon turns it on and says when it turns off", async ({
    page,
  }) => {
    await page.clock.install({ time: TURNED_ON_AT });
    await openLibrary(page);

    await choose("screenshotMode");

    await expect(page.getByText("Screenshot mode is on")).toBeAttached();
    await expect(page.getByText("Turns off at 10:14 PM")).toBeAttached();
  });

  test("Screenshot mode chosen after its hour ran out while away turns it on for another hour", async ({
    page,
  }) => {
    await page.clock.install({ time: TURNED_ON_AT });
    await openLibrary(page);
    await choose("screenshotMode");
    await expect(page.getByText("Turns off at 10:14 PM")).toBeAttached();
    await page.clock.setSystemTime(BACK_AFTER_ITS_HOUR);

    await watching[0]?.send("screenshotMode");

    await expect(page.getByText("Turns off at 11:19 PM")).toBeAttached();
  });

  test("the icon says Screenshot mode is on once it is", async ({ page }) => {
    await openLibrary(page);

    await choose("screenshotMode");

    await expect.poll(lastShownMenu).toMatchObject({
      screenshotModeState: "On",
      screenshotModeWithState: "Screenshot mode · On",
    });
  });

  test("Screenshot mode chosen again turns it off", async ({ page }) => {
    await openLibrary(page);
    await choose("screenshotMode");
    await expect(page.getByText("Screenshot mode is on")).toBeAttached();

    await watching[0]?.send("screenshotMode");

    await expect.poll(lastShownMenu).toMatchObject({
      screenshotModeState: "Off",
    });
  });

  test("Continue reading chosen on the icon opens the last unfinished book", async ({
    page,
  }) => {
    await servePages(page);
    await openLibrary(page);

    await choose("continueReading");

    await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
  });

  test("Search the library chosen on the icon opens library search", async ({
    page,
  }) => {
    await openLibrary(page);

    await choose("searchLibrary");

    await expect(page).toHaveURL(/\/search$/);
  });
});

test.describe("opened from a shortcut on the icon", () => {
  test.use({ backend: backendOn("android", "searchLibrary") });

  test("follows the shortcut once the app has started", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/search$/);
  });
});

test.describe("on an iPhone", () => {
  testOnlyInItsWebview("ios");
  test.use({ backend: backendOn("ios") });

  test("gives the icon its quick actions in the app's words", async ({
    page,
  }) => {
    await openLibrary(page);

    await expect.poll(lastShownMenu).toMatchObject({
      screenshotMode: "Screenshot mode",
      screenshotModeState: "Off",
    });
  });
});

test.describe("on a computer", () => {
  test.use({ backend: backendOn("linux") });

  test("has no icon shortcuts to fill or watch", async ({ page }) => {
    await openLibrary(page);

    expect([shownMenus, watching]).toEqual([[], []]);
  });
});

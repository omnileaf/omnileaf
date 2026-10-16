import type { Page } from "@playwright/test";

import type { HistoryEntry, TrayMenu } from "../../src/lib/ipc/bindings.ts";
import { emitFakeEvent, type FakeBackend } from "./fake-backend.ts";
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
const STARTED_AT_MS = 1_790_000_000_000;
const TRAY_ITEM_CHOSEN = "tray-item-chosen";
const READING_SAVED = "reading-saved";

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

const shownMenus: TrayMenu[] = [];

function backendOn(
  platform: "linux" | "macos" | "android",
  unfinished: readonly HistoryEntry[] = [LAST_BOOK],
): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo(platform),
    openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
    readingHistory: (_after, of) => ({
      entries: of.kind === "unfinished" ? [...unfinished] : [],
      next: null,
    }),
    showTrayMenu: (menu) => {
      shownMenus.push(menu);
      return null;
    },
  };
}

function lastShownMenu(): TrayMenu | undefined {
  return shownMenus.at(-1);
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test.beforeEach(() => {
  shownMenus.length = 0;
});

test.describe("on a computer", () => {
  test.use({ backend: backendOn("linux") });

  test("gives the tray its items in the app's words", async ({ page }) => {
    await openLibrary(page);

    await expect.poll(lastShownMenu).toMatchObject({
      open: "Open Omnileaf",
      screenshotMode: "Screenshot mode",
      screenshotModeState: "Off",
      isScreenshotModeOn: false,
      screenshotModeShortcut: { letter: "H", shift: true },
      continueReading: "Continue reading",
      hasBookToContinue: true,
      quit: "Quit Omnileaf",
    });
  });

  test("ticks Screenshot mode in the tray and says when it turns off", async ({
    page,
  }) => {
    await page.clock.install({ time: TURNED_ON_AT });
    await openLibrary(page);

    await page.keyboard.press("Control+Shift+H");

    await expect.poll(lastShownMenu).toMatchObject({
      screenshotModeState: "On · turns off at 10:14 PM",
      isScreenshotModeOn: true,
    });
  });

  test("Screenshot mode chosen in the tray turns it on", async ({ page }) => {
    await openLibrary(page);

    await emitFakeEvent(page, TRAY_ITEM_CHOSEN, "screenshotMode");

    await expect(page.getByText("Screenshot mode is on")).toBeAttached();
  });

  test("Continue reading chosen in the tray opens the last unfinished book", async ({
    page,
  }) => {
    await servePages(page);
    await openLibrary(page);

    await emitFakeEvent(page, TRAY_ITEM_CHOSEN, "continueReading");

    await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
  });

  test("carries a shortcut chosen in settings to the tray", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "omnileaf.screenshotModeShortcut",
        JSON.stringify({ letter: "J", shift: false }),
      );
    });

    await openLibrary(page);

    await expect.poll(lastShownMenu).toMatchObject({
      screenshotModeShortcut: { letter: "J", shift: false },
    });
  });

  test("Screenshot mode settings list the tray under Turn it on quickly", async ({
    page,
  }) => {
    await page.goto("/settings/privacy/screenshot-mode");

    await expect(
      page.getByRole("region", { name: "Turn it on quickly" }),
    ).toContainText(
      /Tray\s*The Omnileaf icon there has Screenshot mode, with its state\./,
    );
  });
});

test.describe("with nothing left unfinished", () => {
  test.use({ backend: backendOn("linux", []) });

  test("greys Continue reading out", async ({ page }) => {
    await openLibrary(page);

    await expect.poll(lastShownMenu).toMatchObject({
      hasBookToContinue: false,
    });
  });
});

test.describe("when the last unfinished book is finished", () => {
  const unfinished: HistoryEntry[] = [];
  test.use({ backend: backendOn("linux", unfinished) });

  test.beforeEach(() => {
    unfinished.splice(0, unfinished.length, LAST_BOOK);
  });

  test("greys Continue reading out", async ({ page }) => {
    await openLibrary(page);
    await expect.poll(lastShownMenu).toMatchObject({
      hasBookToContinue: true,
    });

    unfinished.length = 0;
    await emitFakeEvent(page, READING_SAVED, {
      book: LAST_BOOK.book,
      series: LAST_BOOK.series,
    });

    await expect.poll(lastShownMenu).toMatchObject({
      hasBookToContinue: false,
    });
  });
});

test.describe("on macOS", () => {
  testOnlyInItsWebview("macos");
  test.use({ backend: backendOn("macos") });

  test("Screenshot mode settings call it the menu bar", async ({ page }) => {
    await page.goto("/settings/privacy/screenshot-mode");

    await expect(
      page.getByRole("region", { name: "Turn it on quickly" }),
    ).toContainText("Menu bar");
  });
});

test.describe("on a phone", () => {
  test.use({ backend: backendOn("android") });

  test("has no tray to fill", async ({ page }) => {
    await openLibrary(page);
    await page.keyboard.press("Control+Shift+H");

    expect(shownMenus).toEqual([]);
  });
});

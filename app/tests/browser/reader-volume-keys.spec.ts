import type { Locator, Page } from "@playwright/test";

import type { PageTurn, Platform } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend, FakeChannel } from "./fake-backend.ts";
import {
  expect,
  framesPassed,
  onPlatform,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  BOOK_TITLE,
  NEXT_BOOK,
  PAGE_COUNT,
  readerBackend,
  readerBook,
  servePages,
  type WireOpening,
} from "./reader-book.ts";

type OpenedBook = ReturnType<typeof readerBook>;
type VolumeKeyCall = "capture" | "release";

const LOOK_KEY = "omnileaf.readerSettings.all";
const STRIP_SEEN_KEYS = [
  "omnileaf.readerGuide.strip",
  `omnileaf.stripFound.${BOOK_SERIES_ID}`,
];
const TURNS_PAGES = { turnsPagesWithVolumeKeys: true };
const STARTED_ON_14: WireOpening = {
  reading: { state: "started", page: 14 },
  startPage: 13,
};
const STRIP_PAGE = { width: 800, height: 2400 };
const SERIES_PAGE = new RegExp(`/series/${BOOK_SERIES_ID}$`);
const NEXT_BOOK_PAGE = new RegExp(`/read/${NEXT_BOOK.id}$`);

const calls: VolumeKeyCall[] = [];
const channels: FakeChannel<PageTurn>[] = [];

function volumeKeysBackend(
  platform: Platform,
  opened: Partial<OpenedBook> = {},
): FakeBackend {
  return {
    ...readerBackend(onPlatform(platform).backend, STARTED_ON_14),
    openBook: (id) => ({ ...readerBook(STARTED_ON_14), ...opened, id }),
    captureVolumeKeys: (channel) => {
      calls.push("capture");
      channels.push(channel);
      return null;
    },
    releaseVolumeKeys: () => {
      calls.push("release");
      return null;
    },
  };
}

function stripPages(): Partial<OpenedBook> {
  return {
    pages: readerBook(STARTED_ON_14).pages.map((page) => ({
      ...page,
      size: STRIP_PAGE,
    })),
  };
}

async function openBookWith(page: Page, look: object): Promise<void> {
  await page.addInitScript(
    ({ key, value, seen }) => {
      localStorage.setItem(key, value);
      for (const shown of seen) {
        localStorage.setItem(shown, "seen");
      }
    },
    { key: LOOK_KEY, value: JSON.stringify(look), seen: STRIP_SEEN_KEYS },
  );
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
}

async function press(turn: PageTurn): Promise<void> {
  await expect.poll(() => calls.at(-1)).toBe("capture");
  await channels.at(-1)?.send(turn);
}

async function expectOnPage(page: Page, number: number): Promise<void> {
  await expect(page.getByRole("slider", { name: "Page" })).toHaveAttribute(
    "aria-valuetext",
    `Page ${String(number)} of ${String(PAGE_COUNT)}`,
  );
}

function strip(page: Page): Locator {
  return page.locator("[data-strip]");
}

async function openSettings(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
}

testOnlyInItsWebview("android");

test.beforeEach(() => {
  calls.length = 0;
  channels.length = 0;
});

test.describe("on Android", () => {
  test.use({ backend: volumeKeysBackend("android") });

  test("turns to the next page in reading order when Android sends next", async ({
    page,
  }) => {
    await openBookWith(page, TURNS_PAGES);

    await press("next");
    await expectOnPage(page, 15);
    await press("previous");

    await expectOnPage(page, 14);
  });

  test("leaves the keys to the volume with the setting off", async ({
    page,
  }) => {
    await openBookWith(page, {});

    await expectOnPage(page, 14);
    await framesPassed(page);

    expect(calls).toEqual([]);
  });

  test("keeps the keys captured while other reading settings change", async ({
    page,
  }) => {
    await openBookWith(page, TURNS_PAGES);
    await expect.poll(() => calls).toEqual(["capture"]);
    await openSettings(page);

    await page
      .getByRole("group", { name: "Background" })
      .getByRole("radio", { name: "White", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), LOOK_KEY))
      .toContain('"background":"white"');
    await framesPassed(page);

    expect(calls).toEqual(["capture"]);
  });

  test("lets the keys go when the reader closes", async ({ page }) => {
    await openBookWith(page, TURNS_PAGES);
    await expect.poll(() => calls).toEqual(["capture"]);

    await page.keyboard.press("Alt+ArrowLeft");

    await expect(page).toHaveURL(SERIES_PAGE);
    await expect.poll(() => calls).toEqual(["capture", "release"]);
  });

  test("takes the keys again for the next book", async ({ page }) => {
    await openBookWith(page, TURNS_PAGES);
    await page.keyboard.press("End");
    await expectOnPage(page, PAGE_COUNT);

    await press("next");
    await press("next");

    await expect(page).toHaveURL(NEXT_BOOK_PAGE);
    await expect.poll(() => calls.length).toBe(3);
    await framesPassed(page);

    expect(calls).toEqual(["capture", "release", "capture"]);
  });
});

test.describe("on Android with a right-to-left book", () => {
  test.use({
    backend: volumeKeysBackend("android", { readingDirection: "rightToLeft" }),
  });

  test("turns a right-to-left book forward when Android sends next", async ({
    page,
  }) => {
    await openBookWith(page, TURNS_PAGES);

    await press("next");

    await expectOnPage(page, 15);
  });
});

test.describe("on Android with a long strip", () => {
  test.use({ backend: volumeKeysBackend("android", stripPages()) });

  test("scrolls a long strip a screen when Android sends next", async ({
    page,
  }) => {
    await openBookWith(page, TURNS_PAGES);
    await expect(strip(page)).toBeVisible();
    const before = await strip(page).evaluate((element) => element.scrollTop);

    await press("next");

    await expect
      .poll(() => strip(page).evaluate((element) => element.scrollTop))
      .toBeGreaterThan(before);
  });
});

test.describe("on a computer", () => {
  test.use({ backend: volumeKeysBackend("linux") });

  test("has no volume keys to capture", async ({ page }) => {
    await openBookWith(page, TURNS_PAGES);

    await expectOnPage(page, 14);
    await framesPassed(page);

    expect(calls).toEqual([]);
  });
});

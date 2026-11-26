import type { Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";
import {
  entry,
  seriesTitle,
  THURSDAY_EVENING,
  type WireEntry,
} from "./history-entries.ts";

const FIRST_BOOK = 4;
const SECOND_BOOK = 1;
const THIRD_BOOK = 3;
const FINISHED_BOOK = 5;
const FIRST_BOOK_PAGE = 14;
const FIRST_BOOK_PAGES = 192;
const TOP_BAR_HEIGHT = 64;
const STATUS_BAR_HEIGHT = 24;
const BAR_START = 12;
const BAR_END_INSET = 8;
const MENU_REACH = 80;
const HEADING_START = 16;
const LIST_HEADER_GAP = 16;
const COVER_HEIGHT = 56;
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };

const BOOKS: readonly WireEntry[] = [
  entry(FIRST_BOOK, "2026-10-08T21:40:00.000Z", {
    state: "page",
    page: FIRST_BOOK_PAGE,
    pageCount: FIRST_BOOK_PAGES,
  }),
  entry(SECOND_BOOK, "2026-10-07T22:05:00.000Z", {
    state: "page",
    page: 3,
    pageCount: 24,
  }),
  entry(THIRD_BOOK, "2026-10-05T19:30:00.000Z", {
    state: "page",
    page: 18,
    pageCount: 40,
  }),
  entry(FINISHED_BOOK, "2026-10-05T18:30:00.000Z", { state: "end" }),
];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    readingHistory: () => ({ entries: [...BOOKS], next: null }),
  },
});

async function underStatusBar(page: Page): Promise<void> {
  await page.addInitScript((top) => {
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.style.setProperty(
        "--system-inset-top",
        `${String(top)}px`,
      );
    });
  }, STATUS_BAR_HEIGHT);
}

async function openHistory(page: Page, screen = PHONE): Promise<void> {
  await page.setViewportSize(screen);
  await page.clock.setFixedTime(THURSDAY_EVENING);
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { level: 1, name: "History" }),
  ).toBeVisible();
}

async function expectTrackAcrossTheColumn(
  page: Page,
  screen: typeof PHONE,
): Promise<void> {
  await openHistory(page, screen);
  const row = page.getByRole("main").getByRole("listitem").first();
  const column = await boxOf(
    row.getByText(seriesTitle(FIRST_BOOK), { exact: true }).locator(".."),
  );
  const track = await boxOf(row.getByRole("progressbar"));

  expect(track.x).toBe(column.x);
  expect(track.width).toBe(column.width);
}

test.describe("History on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's top app bar");
  });

  test("draws a single 64px row with the title 12px from the start and the actions 8px from the end", async ({
    page,
  }) => {
    await openHistory(page);
    const title = page.getByRole("heading", { level: 1, name: "History" });
    const clear = page.getByRole("button", { name: "Clear History" });
    const titleBox = await title.boundingBox();
    const clearBox = await clear.boundingBox();

    expect(titleBox?.height).toBe(TOP_BAR_HEIGHT);
    expect(titleBox?.x).toBe(BAR_START);
    expect(PHONE.width - ((clearBox?.x ?? 0) + (clearBox?.width ?? 0))).toBe(
      BAR_END_INSET,
    );
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openHistory(page);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }

  test("sets the day headings in medium-weight muted text with no reading time", async ({
    page,
  }) => {
    await openHistory(page);
    const today = page.getByRole("heading", { level: 2, name: "Today" });

    await expect(today).toHaveCSS("font-weight", "500");
    await expect(today).toHaveCSS(
      "color",
      await tokenColour(page, "--secondary-text"),
    );
    await expect(today).toHaveCSS("font-size", "14px");
    await expect(today).toHaveCSS("line-height", "20px");
    expect((await today.boundingBox())?.x).toBe(HEADING_START);
    await expect(page.getByTestId("group-total")).toHaveCount(0);
  });
  test("sets each series name at 16px in regular weight over a 14px line", async ({
    page,
  }) => {
    await openHistory(page);
    const row = page.getByRole("main").getByRole("listitem").first();
    const name = row.getByText("Sample Series 04", { exact: true });
    const line = row.getByText(/^Volume 4/);

    await expect(name).toHaveCSS("font-size", "16px");
    await expect(name).toHaveCSS("line-height", "24px");
    await expect(name).toHaveCSS("font-weight", "400");
    await expect(name).toHaveCSS("letter-spacing", "0.5px");
    await expect(line).toHaveCSS("font-size", "14px");
    await expect(line).toHaveCSS("line-height", "20px");
  });

  test("draws the more button as a 24px vertical-dots icon", async ({
    page,
  }) => {
    await openHistory(page);
    const more = page
      .getByRole("button", { name: "More for Volume 4" })
      .locator('[data-icon="ellipsis"]');

    await expect(more).toHaveCSS("width", "24px");
    await expect(more).toHaveCSS("height", "24px");
  });

  test("opens an anchored menu of the entry's actions instead of a sheet", async ({
    page,
  }) => {
    await openHistory(page);
    const more = page.getByRole("button", { name: "More for Volume 4" });
    await more.click();
    const menu = page.getByRole("menu");

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(menu.getByRole("menuitem")).toHaveText([
      /^\s*Continue reading\s*$/,
      /^\s*Open the series\s*$/,
      /^\s*Remove from History\s*$/,
    ]);
    const moreBox = await more.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(menuBox?.y).toBeLessThan((moreBox?.y ?? 0) + MENU_REACH);
  });

  test("spans each entry's progress track across the text column", async ({
    page,
  }) => {
    await expectTrackAcrossTheColumn(page, PHONE);
  });

  test("ends every row's progress track at the same place, whatever its text", async ({
    page,
  }) => {
    await openHistory(page);
    const tracks = await page
      .getByRole("main")
      .getByRole("progressbar")
      .evaluateAll((bars) =>
        bars.map((bar) => Math.round(bar.getBoundingClientRect().right)),
      );

    expect(new Set(tracks).size).toBe(1);
  });

  test("puts each day heading 16px under the bar or the row above it", async ({
    page,
  }) => {
    await openHistory(page);
    const bar = await boxOf(
      page.locator("header").filter({
        has: page.getByRole("heading", { level: 1, name: "History" }),
      }),
    );
    const today = await boxOf(
      page.getByRole("heading", { level: 2, name: "Today" }),
    );
    const yesterday = await boxOf(
      page.getByRole("heading", { level: 2, name: "Yesterday" }),
    );
    const lastToday = await boxOf(
      page.getByRole("region", { name: "Today" }).getByRole("listitem").last(),
    );

    expect(today.y - (bar.y + bar.height)).toBe(LIST_HEADER_GAP);
    expect(yesterday.y - (lastToday.y + lastToday.height)).toBe(
      LIST_HEADER_GAP,
    );
  });

  test("lines up each row's cover, text and more button on one centre with a 56px cover", async ({
    page,
  }) => {
    await openHistory(page);
    const row = page.getByRole("main").getByRole("listitem").first();
    const cover = await boxOf(row.locator('[data-slot="list-cover"]'));
    const name = await boxOf(
      row.getByText("Sample Series 04", { exact: true }),
    );
    const bar = await boxOf(row.getByRole("progressbar"));
    const more = await boxOf(
      row.getByRole("button", { name: "More for Volume 4" }),
    );
    const centreOf = (box: { y: number; height: number }) =>
      box.y + box.height / 2;
    const textCentre = (name.y + bar.y + bar.height) / 2;

    expect(cover.x).toBe(HEADING_START);
    expect(cover.height).toBeCloseTo(COVER_HEIGHT, 0);
    expect(Math.abs(centreOf(cover) - textCentre)).toBeLessThanOrEqual(1);
    expect(Math.abs(centreOf(more) - centreOf(cover))).toBeLessThanOrEqual(1);
  });

  test("fills one continuous track from its start up to the page reached", async ({
    page,
  }) => {
    await openHistory(page);
    const track = page
      .getByRole("main")
      .getByRole("listitem")
      .first()
      .getByRole("progressbar");
    const trackBox = await boxOf(track);
    const parts = track.locator("> div");
    const fill = await boxOf(parts.first());

    await expect(parts).toHaveCount(1);
    await expect(track).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-progress-rest"),
    );
    expect(fill.x).toBe(trackBox.x);
    expect(fill.width).toBeCloseTo(
      (trackBox.width * FIRST_BOOK_PAGE) / FIRST_BOOK_PAGES,
      0,
    );
  });

  test("draws no bar under a finished book", async ({ page }) => {
    await openHistory(page);
    const finished = page
      .getByRole("main")
      .getByRole("listitem")
      .filter({ hasText: "Sample Series 05" });

    await expect(finished).toBeVisible();
    await expect(finished.getByRole("progressbar")).toHaveCount(0);
  });

  test("opens the search in place of the title, in the same bar, with nothing behind the field", async ({
    page,
  }) => {
    await underStatusBar(page);
    await openHistory(page);
    const title = await boxOf(
      page.getByRole("heading", { level: 1, name: "History" }),
    );
    const firstEntry = page.getByRole("main").getByRole("listitem").first();
    const entryBefore = await boxOf(firstEntry);

    await page.getByRole("button", { name: "Search History" }).click();

    const field = page.getByRole("searchbox", { name: "Search History" });
    await expect(field).toBeFocused();
    const group = field.locator("xpath=ancestor::div[1]");
    const bar = await boxOf(field.locator("xpath=ancestor::div[2]"));
    await expect(group).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(title.y).toBeGreaterThanOrEqual(STATUS_BAR_HEIGHT);
    expect([bar.y, bar.height]).toEqual([title.y, title.height]);
    expect((await boxOf(firstEntry)).y).toBe(entryBefore.y);
  });

  test("puts the title back without moving the list when the search closes", async ({
    page,
  }) => {
    await underStatusBar(page);
    await openHistory(page);
    const firstEntry = page.getByRole("main").getByRole("listitem").first();
    const entryBefore = await boxOf(firstEntry);
    await page.getByRole("button", { name: "Search History" }).click();

    await page.getByRole("button", { name: "Back to History" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "History" }),
    ).toBeVisible();
    expect((await boxOf(firstEntry)).y).toBe(entryBefore.y);
  });
});

test.describe("History on an Android tablet", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's History rows");
  });

  test("draws one continuous track and no bar under a finished book", async ({
    page,
  }) => {
    await openHistory(page, TABLET);
    const rows = page.getByRole("main").getByRole("listitem");
    const track = rows.first().getByRole("progressbar");

    const finished = rows.filter({ hasText: seriesTitle(FINISHED_BOOK) });

    await expect(track.locator("> div")).toHaveCount(1);
    await expect(finished).toBeVisible();
    await expect(finished.getByRole("progressbar")).toHaveCount(0);
  });

  test("spans the progress track across the text column", async ({ page }) => {
    await expectTrackAcrossTheColumn(page, TABLET);
  });
});

test.describe("History loading on an Android phone", { tag: "@native" }, () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      readingHistory: () => new Promise(() => undefined),
    },
  });

  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's History rows");
  });

  test("draws its skeleton rows where the loaded rows will sit", async ({
    page,
  }) => {
    await openHistory(page);
    const bar = await boxOf(
      page.locator("header").filter({
        has: page.getByRole("heading", { level: 1, name: "History" }),
      }),
    );
    const loading = page.getByRole("status", { name: "Loading History" });
    const status = await boxOf(loading);
    const cover = await boxOf(
      loading.locator('[data-slot="skeleton"]').first(),
    );

    expect(status.y).toBe(bar.y + bar.height);
    expect(cover.x).toBe(HEADING_START);
    expect(cover.height).toBeCloseTo(COVER_HEIGHT, 0);
  });
});

test.describe("Empty History on an Android phone", { tag: "@native" }, () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      readingHistory: () => ({ entries: [], next: null }),
    },
  });

  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's empty History");
  });

  test("makes Go to the library the filled button", async ({ page }) => {
    await openHistory(page);
    const action = page.getByRole("link", { name: "Go to the library" });

    const colours = await action.evaluate((link) => {
      const style = getComputedStyle(link);
      return [style.backgroundColor, style.color];
    });

    expect(colours).toEqual([
      await tokenColour(page, "--native-color-button-primary"),
      await tokenColour(page, "--native-color-on-button-primary"),
    ]);
  });
});

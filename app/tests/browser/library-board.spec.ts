import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  LARGE_MIN_WIDTH,
  MEDIUM_MIN_WIDTH,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import type { WireSeries } from "./series-catalog.ts";

const LONG_TITLE =
  "The Lighthouse Keeper’s Apprentice Spends Every Winter Writing Letters to a Sister Across the Northern Sea";
const CAPTION_SIZE = "14px";
const CAPTION_WEIGHT = "500";
const CAPTION_LINES = 2;
const BADGE_HEIGHT = 22;
const GAPS = {
  phone: { column: 12, row: 20 },
  desktop: { column: 24, row: 28 },
} as const;

function series(
  number: number,
  title: string,
  bookCount: number,
  unreadCount: number,
): WireSeries {
  return {
    id: `0190a3e4-0000-8000-8000-${String(number).padStart(12, "0")}`,
    title,
    bookCount,
    unreadCount,
    cover: null,
    language: null,
    hasDownloads: false,
    isAdult: false,
    continuesFrom: null,
  };
}

const LIBRARY: readonly WireSeries[] = [
  series(1, "Sample Series 01", 12, 12),
  series(4, "Sample Series 04", 8, 6),
  series(2, "Sample Series 02", 5, 0),
  series(19, LONG_TITLE, 3, 1),
  ...Array.from({ length: 8 }, (_, index) =>
    series(
      index + 5,
      `Sample Series ${String(index + 5).padStart(2, "0")}`,
      4,
      4,
    ),
  ),
];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: [...LIBRARY], next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

function cell(page: Page, title: string): Locator {
  return page
    .getByRole("list", { name: "Series" })
    .getByRole("listitem")
    .filter({ hasText: title });
}

test("names each series in two lines at most, in 14px medium text", async ({
  page,
}) => {
  await page.goto("/");
  const title = cell(page, LONG_TITLE).getByText(LONG_TITLE);

  const lineHeight = await title.evaluate((element) =>
    parseFloat(getComputedStyle(element).lineHeight),
  );

  await expect(title).toHaveCSS("font-size", CAPTION_SIZE);
  await expect(title).toHaveCSS("font-weight", CAPTION_WEIGHT);
  expect((await boxOf(title)).height).toBeLessThanOrEqual(
    lineHeight * CAPTION_LINES + 1,
  );
  expect((await boxOf(title)).height).toBeGreaterThan(lineHeight);
});

test("gives a cut-off title whole in a tooltip while the pointer rests on it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.use.hasTouch === true, "no pointer rests here");
  await page.goto("/");

  await cell(page, LONG_TITLE).getByText(LONG_TITLE).hover();

  await expect(page.locator("[data-tooltip-content]")).toHaveText(LONG_TITLE);
});

test("shows how far a started series is read under its cover", async ({
  page,
}) => {
  await page.goto("/");

  const started = cell(page, "Sample Series 04").getByRole("progressbar");
  const unopened = cell(page, "Sample Series 01").getByRole("progressbar");
  const finished = cell(page, "Sample Series 02").getByRole("progressbar");

  await expect(started).toHaveAttribute("aria-valuenow", "25");
  await expect(unopened).toHaveCount(0);
  await expect(finished).toHaveCount(0);
});

test("counts a series' unread books on a 22px primary badge", async ({
  page,
}) => {
  await page.goto("/");
  const badge = cell(page, "Sample Series 04").getByRole("img", {
    name: "6 unread",
  });

  await expect(badge).toHaveCSS(
    "background-color",
    await tokenColour(page, "--primary"),
  );
  await expect(badge).toHaveCSS(
    "color",
    await tokenColour(page, "--primary-foreground"),
  );
  expect((await boxOf(badge)).height).toBe(BADGE_HEIGHT);
});

test("spaces the covers as the boards do", async ({ page }) => {
  const width = viewportOf(page).width;
  test.skip(
    width >= MEDIUM_MIN_WIDTH && width < LARGE_MIN_WIDTH,
    "the boards draw phones and desktops",
  );
  await page.goto("/");
  const gaps = width < MEDIUM_MIN_WIDTH ? GAPS.phone : GAPS.desktop;
  const items = page
    .getByRole("list", { name: "Series" })
    .getByRole("listitem");

  const first = await boxOf(items.nth(0));
  const second = await boxOf(items.nth(1));
  const rowGap = await page
    .getByRole("list", { name: "Series" })
    .evaluate((list) => parseFloat(getComputedStyle(list).rowGap));

  expect(Math.round(second.x - (first.x + first.width))).toBe(gaps.column);
  expect(rowGap).toBe(gaps.row);
});

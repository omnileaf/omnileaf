import type { Locator, Page } from "@playwright/test";

import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const AWAY_COUNT = 2;
const CONNECTED = sampleSeries(4, AWAY_COUNT + 1);
const AWAY = sampleSeries(AWAY_COUNT).map((series) => ({
  ...series,
  bookCount: 4,
  unreadCount: 3,
  isConnected: false,
}));
const LISTED = [...CONNECTED.slice(0, 1), ...AWAY, ...CONNECTED.slice(1)];
const AWAY_TITLE = AWAY[0]?.title ?? "";
const CONNECTED_TITLE = CONNECTED[0]?.title ?? "";
const NOT_CONNECTED_OPACITY = "0.45";
const MARK_HEIGHT = 20;
const MARK_INSET_START = 6;
const MARK_INSET_END = 8;

test.use({
  platform: "windows",
  viewport: { width: 1280, height: 800 },
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: [...LISTED], next: null }),
    librarySeriesCount: () => LISTED.length,
  },
});

function tileOf(page: Page, title: string): Locator {
  return page
    .getByRole("list", { name: "Series" })
    .getByRole("listitem")
    .filter({ hasText: title });
}

test.describe("a series whose folder is not there on Windows", () => {
  test("is tagged Not connected over its cover, and the cover is dimmed", async ({
    page,
  }) => {
    await page.goto("/");
    const tile = tileOf(page, AWAY_TITLE);

    await expect(tile.getByText("Not connected")).toBeVisible();
    await expect(tile.locator("[data-slot=cover-dim]")).toHaveCSS(
      "opacity",
      NOT_CONNECTED_OPACITY,
    );
    await expect(tile.locator("[data-slot=not-connected]")).not.toHaveCSS(
      "opacity",
      NOT_CONNECTED_OPACITY,
    );
  });

  test("draws the tag as a 20 px control chip at the foot of the cover", async ({
    page,
  }) => {
    await page.goto("/");
    const tile = tileOf(page, AWAY_TITLE);
    const cover = await boxOf(tile.locator("[data-slot=cover-dim]"));
    const mark = await boxOf(tile.locator("[data-slot=not-connected]"));

    expect(mark.height).toBeCloseTo(MARK_HEIGHT, 0);
    expect(mark.x).toBeCloseTo(cover.x + MARK_INSET_START, 0);
    expect(mark.y + mark.height).toBeCloseTo(
      cover.y + cover.height - MARK_INSET_END,
      0,
    );
  });

  test("turns its books line red and leaves a connected series' line alone", async ({
    page,
  }) => {
    await page.goto("/");
    const danger = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-danger)";
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });

    await expect(
      tileOf(page, AWAY_TITLE).getByText("4 books", { exact: true }),
    ).toHaveCSS("color", danger);
    await expect(
      tileOf(page, CONNECTED_TITLE).getByText(/books?$/),
    ).not.toHaveCSS("color", danger);
  });

  test("cannot be opened, and says it is not connected", async ({ page }) => {
    await page.goto("/");
    const tile = tileOf(page, AWAY_TITLE);

    await expect(tile.getByRole("link")).toHaveCount(0);
    const group = tile.getByRole("group", {
      name: `${AWAY_TITLE}, not connected`,
    });
    await expect(group).toHaveAttribute("aria-disabled", "true");
    await group.click({ force: true });
    await expect(page).toHaveURL(/\/$/);
  });

  test("leaves a series from a folder that is there as it was", async ({
    page,
  }) => {
    await page.goto("/");
    const tile = tileOf(page, CONNECTED_TITLE);

    await expect(tile.getByText("Not connected")).toHaveCount(0);
    await expect(tile.locator("[data-slot=cover-dim]")).toHaveCount(0);
    await expect(tile.getByRole("link")).toHaveCount(1);
  });
});

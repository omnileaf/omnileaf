import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
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
const IOS_MARK_HEIGHT = 20;
const IOS_MARK_INSET_START = 4;
const IOS_MARK_INSET_END = 6;

test.use({
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

async function colourOf(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

test.describe("a series whose folder is not there on an iPhone", () => {
  test.use({ platform: "ios", viewport: { width: 390, height: 844 } });

  test("is tagged Not connected on its dimmed cover", async ({ page }) => {
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

  test("draws the tag as a 20px capsule 4px in and 6px up from the cover's foot", async ({
    page,
  }) => {
    await page.goto("/");
    const tile = tileOf(page, AWAY_TITLE);
    const cover = await boxOf(tile.locator("[data-slot=cover-dim]"));
    const mark = await boxOf(tile.locator("[data-slot=not-connected]"));

    expect(mark.height).toBeCloseTo(IOS_MARK_HEIGHT, 0);
    expect(mark.x).toBeCloseTo(cover.x + IOS_MARK_INSET_START, 0);
    expect(mark.y + mark.height).toBeCloseTo(
      cover.y + cover.height - IOS_MARK_INSET_END,
      0,
    );
  });

  test("turns its books line red and cannot be opened", async ({ page }) => {
    await page.goto("/");
    const tile = tileOf(page, AWAY_TITLE);

    await expect(tile.getByText("4 books", { exact: true })).toHaveCSS(
      "color",
      await colourOf(page, "--color-danger"),
    );
    await expect(tile.getByRole("link")).toHaveCount(0);
  });

  test("leaves a series from a folder that is there as it was", async ({
    page,
  }) => {
    await page.goto("/");
    const tile = tileOf(page, CONNECTED_TITLE);

    await expect(tile.getByText("Not connected")).toHaveCount(0);
    await expect(tile.getByRole("link")).toHaveCount(1);
  });
});

test.describe("a series whose folder is not there on a Mac", () => {
  testOnlyInItsWebview("macos");
  test.use({ platform: "macos", viewport: { width: 1280, height: 800 } });

  test("is marked Not connected, grayed and dimmed", async ({ page }) => {
    await page.goto("/");
    const tile = tileOf(page, AWAY_TITLE);

    await expect(tile.getByText("Not connected")).toBeVisible();
    const cover = tile.locator("[data-slot=cover-dim]");
    await expect(cover).toHaveCSS("opacity", NOT_CONNECTED_OPACITY);
    await expect(cover).toHaveCSS("filter", "grayscale(1)");
  });

  test("turns its books line red and cannot be opened", async ({ page }) => {
    await page.goto("/");
    const tile = tileOf(page, AWAY_TITLE);

    await expect(tile.getByText("4 books", { exact: true })).toHaveCSS(
      "color",
      await colourOf(page, "--color-danger"),
    );
    await expect(tile.getByRole("link")).toHaveCount(0);
  });

  test("leaves a series from a folder that is there as it was", async ({
    page,
  }) => {
    await page.goto("/");
    const tile = tileOf(page, CONNECTED_TITLE);

    await expect(tile.getByText("Not connected")).toHaveCount(0);
    await expect(tile.getByRole("link")).toHaveCount(1);
  });
});

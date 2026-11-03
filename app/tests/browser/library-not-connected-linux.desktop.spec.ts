import type { Locator, Page } from "@playwright/test";

import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
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
const LAST_CONNECTED_TITLE = CONNECTED.at(-1)?.title ?? "";
const NOT_CONNECTED_OPACITY = "0.45";
const MARK_INSET = 6;

test.use({
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

test.describe("a series whose folder is not there on Linux", () => {
  test.use({ platform: "linux" });

  test("is marked Not connected over its cover, and the cover is dimmed", async ({
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
    await expect(tile.locator("[data-slot=not-connected]")).toHaveCSS(
      "font-weight",
      "600",
    );
  });

  test("spreads the mark across the foot of the cover, six pixels in", async ({
    page,
  }) => {
    await page.goto("/");
    const tile = tileOf(page, AWAY_TITLE);
    const cover = await boxOf(tile.locator("[data-slot=cover-dim]"));
    const mark = await boxOf(tile.locator("[data-slot=not-connected]"));

    expect(mark.x).toBeCloseTo(cover.x + MARK_INSET, 0);
    expect(mark.x + mark.width).toBeCloseTo(
      cover.x + cover.width - MARK_INSET,
      0,
    );
    expect(mark.y + mark.height).toBeCloseTo(
      cover.y + cover.height - MARK_INSET,
      0,
    );
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

  test("cannot be picked by a click, and a range steps past it", async ({
    page,
  }) => {
    await page.goto("/");
    await tileOf(page, AWAY_TITLE).click({
      force: true,
      modifiers: ["ControlOrMeta"],
    });
    await expect(page.getByRole("checkbox")).toHaveCount(0);

    await tileOf(page, CONNECTED_TITLE)
      .getByRole("link")
      .click({ modifiers: ["ControlOrMeta"] });
    await page
      .getByRole("checkbox", { name: LAST_CONNECTED_TITLE })
      .click({ modifiers: ["Shift"] });

    await expect(
      page.getByText(`${String(CONNECTED.length)} selected`).first(),
    ).toBeVisible();
  });

  test("cannot be picked by Select all", async ({ page }) => {
    await page.goto("/");
    await tileOf(page, CONNECTED_TITLE)
      .getByRole("link")
      .click({ modifiers: ["ControlOrMeta"] });

    await page.getByRole("button", { name: "Select all" }).click();

    await expect(
      page.getByText(`${String(CONNECTED.length)} selected`).first(),
    ).toBeVisible();
    await expect(tileOf(page, AWAY_TITLE).getByRole("checkbox")).toHaveCount(0);
  });
});

test.describe("in the list display on Linux", () => {
  test.use({
    platform: "linux",
    backend: {
      ...DEFAULT_BACKEND,
      librarySeries: () => ({ series: [...LISTED], next: null }),
      librarySeriesCount: () => LISTED.length,
      libraryView: () => ({ ...DEFAULT_LIBRARY_VIEW, display: "list" }),
    },
  });

  test("marks a series Not connected, dims its cover and cannot open it", async ({
    page,
  }) => {
    await page.goto("/");
    const row = tileOf(page, AWAY_TITLE);

    await expect(row.getByText("Not connected")).toBeVisible();
    await expect(row.locator("[data-slot=list-cover]")).toHaveCSS(
      "opacity",
      NOT_CONNECTED_OPACITY,
    );
    await expect(row.getByRole("link")).toHaveCount(0);
  });
});

test.describe("a series whose folder is not there on macOS", () => {
  test.use({ platform: "macos" });

  test("is still shown plainly and opens", async ({ page }) => {
    await page.goto("/");
    const tile = tileOf(page, AWAY_TITLE);

    await expect(tile.getByText("Not connected")).toHaveCount(0);
    await expect(tile.locator("[data-slot=cover-dim]")).toHaveCount(0);
    await expect(tile.getByRole("link")).toHaveAttribute(
      "href",
      `/series/${AWAY[0]?.id ?? ""}`,
    );
  });
});

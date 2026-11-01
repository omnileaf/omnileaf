import type { Page } from "@playwright/test";

import {
  boxOf,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const SERIES_IN_LIBRARY = 6;
const POPOVER_WIDTH = 360;
const EDGE_TOLERANCE_PX = 1;

test.describe("View options on an iPad", () => {
  testOnlyInItsWebview("ios");
  test.skip(({ hasTouch }) => !hasTouch, "an iPad has a touch screen");
  test.use({
    backend: {
      ...onPlatform("ios").backend,
      librarySeries: pagedSeries(() => sampleSeries(SERIES_IN_LIBRARY)),
      librarySeriesCount: () => SERIES_IN_LIBRARY,
    },
  });

  test.beforeEach(async ({ page }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "iPads only");
    await page.goto("/");
    await expect(
      page.getByRole("list", { name: "Series" }).getByRole("listitem"),
    ).toHaveCount(SERIES_IN_LIBRARY);
  });

  function more(page: Page) {
    return page.getByRole("button", { name: "More for the library" });
  }

  test("keeps Sort and filter and View options out of the bar, leaving them in More", async ({
    page,
  }) => {
    const bar = page.getByRole("main");

    await expect(bar.getByRole("button", { name: "View options" })).toHaveCount(
      0,
    );
    await expect(
      bar.getByRole("button", { name: /^Sort and filter/ }),
    ).toHaveCount(0);
    await more(page).click();
    await expect(
      page.getByRole("menuitem", { name: "View options" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Sort and filter" }),
    ).toBeVisible();
  });

  test("opens View options as a popover under More, lined up with its right edge", async ({
    page,
  }) => {
    await more(page).click();
    await page.getByRole("menuitem", { name: "View options" }).click();
    const popover = page.getByRole("dialog", { name: "View options" });
    await expect(popover).toBeVisible();

    const button = await boxOf(more(page));
    await expect
      .poll(async () =>
        Math.abs(
          (await boxOf(popover)).x + POPOVER_WIDTH - (button.x + button.width),
        ),
      )
      .toBeLessThan(EDGE_TOLERANCE_PX);
    const box = await boxOf(popover);
    expect(box.width).toBe(POPOVER_WIDTH);
    expect(box.y).toBeGreaterThanOrEqual(button.y + button.height);
    await expect(popover).toHaveCSS("border-radius", "38px");
  });

  test("returns focus to More when View options closes", async ({ page }) => {
    await more(page).click();
    await page.getByRole("menuitem", { name: "View options" }).click();
    await expect(
      page.getByRole("dialog", { name: "View options" }),
    ).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(
      page.getByRole("dialog", { name: "View options" }),
    ).toHaveCount(0);
    await expect(more(page)).toBeFocused();
  });

  test("opens Sort and filter as a popover under More, lined up with its right edge", async ({
    page,
  }) => {
    await more(page).click();
    await page.getByRole("menuitem", { name: "Sort and filter" }).click();
    const popover = page.getByRole("dialog", { name: "Sort and filter" });
    await expect(popover).toBeVisible();

    const button = await boxOf(more(page));
    await expect
      .poll(async () =>
        Math.abs(
          (await boxOf(popover)).x + POPOVER_WIDTH - (button.x + button.width),
        ),
      )
      .toBeLessThan(EDGE_TOLERANCE_PX);
    const box = await boxOf(popover);
    expect(box.width).toBe(POPOVER_WIDTH);
    expect(box.y).toBeGreaterThanOrEqual(button.y + button.height);
    await expect(popover).toHaveCSS("border-radius", "38px");
    await expect(popover.getByRole("button", { name: "Reset" })).toBeVisible();
  });

  test("returns focus to More when Sort and filter closes", async ({
    page,
  }) => {
    await more(page).click();
    await page.getByRole("menuitem", { name: "Sort and filter" }).click();
    await expect(
      page.getByRole("dialog", { name: "Sort and filter" }),
    ).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(
      page.getByRole("dialog", { name: "Sort and filter" }),
    ).toHaveCount(0);
    await expect(more(page)).toBeFocused();
  });
});

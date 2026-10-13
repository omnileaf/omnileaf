import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  settle,
  test,
  transitionsOf,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { openViewOptions, viewOptionsButton } from "./view-options.ts";

const SERIES_IN_CATALOG = 12;
const DRAG_STEPS = 8;
const HELD_MS = 1000;
const SHORT_PULL = 0.1;
const LONG_PULL = 0.5;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => sampleSeries(SERIES_IN_CATALOG)),
    librarySeriesCount: () => SERIES_IN_CATALOG,
  },
});

test.beforeEach(async ({ page }) => {
  test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
  await page.clock.install();
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem").first(),
  ).toBeVisible();
});

function backdrop(page: Page): Locator {
  return page.locator("[data-dialog-overlay]");
}

function opacityOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).opacity),
  );
}

async function pullDown(
  page: Page,
  sheet: Locator,
  share: number,
): Promise<void> {
  const title = await boxOf(sheet.getByRole("heading").first());
  const { height } = await boxOf(sheet);
  const x = title.x + title.width / 2;
  const y = title.y + title.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + height * share, { steps: DRAG_STEPS });
}

async function letGoSlowly(page: Page): Promise<void> {
  await page.clock.fastForward(HELD_MS);
  await page.mouse.up();
}

test("moves the sheet with the drag and fades the backdrop as it goes", async ({
  page,
}) => {
  const sheet = await openViewOptions(page);
  const before = await boxOf(sheet);

  await pullDown(page, sheet, LONG_PULL);

  const during = await boxOf(sheet);
  expect(during.y - before.y).toBeCloseTo(before.height * LONG_PULL, 0);
  expect(await opacityOf(backdrop(page))).toBeCloseTo(1 - LONG_PULL, 1);
});

test("closes when dragged down past a quarter of its height and hands focus back to its button", async ({
  page,
}) => {
  const sheet = await openViewOptions(page);

  await pullDown(page, sheet, LONG_PULL);
  await letGoSlowly(page);

  await expect(sheet).toBeHidden();
  await expect(viewOptionsButton(page)).toBeFocused();
});

test("springs back into place when let go after a short drag", async ({
  page,
}) => {
  const sheet = await openViewOptions(page);
  const before = await boxOf(sheet);

  await pullDown(page, sheet, SHORT_PULL);
  await letGoSlowly(page);

  await expect.poll(() => transitionsOf(sheet)).toContain("translate");
  await settle(sheet);
  await expect(sheet).toBeVisible();
  expect((await boxOf(sheet)).y).toBeCloseTo(before.y, 0);
  expect(await opacityOf(backdrop(page))).toBe(1);
});

test("springs back at once when motion is reduced", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const sheet = await openViewOptions(page);
  const before = await boxOf(sheet);

  await pullDown(page, sheet, SHORT_PULL);
  await letGoSlowly(page);

  expect(await transitionsOf(sheet)).toEqual([]);
  expect((await boxOf(sheet)).y).toBeCloseTo(before.y, 0);
});

import type { Locator, Page } from "@playwright/test";

import { addFolderBesideFolders, addFolderInPageHeading } from "./controls.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  boxOf,
  expect,
  LARGE_MIN_WIDTH,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { openViewOptions, viewOptionsButton } from "./view-options.ts";

const BUTTON_CORNER = "10px";
const ROW_CORNER = "8px";
const KEY_CORNER = "6px";
const PAGE_BUTTON_HEIGHT = 36;
const PHONE_BUTTON_HEIGHT = 52;
const IOS_BUTTON_CORNER = "14px";
const SHEET_CORNER = "24px";
const PANEL_TITLE_SIZE = "17px";
const PANEL_TITLE_LINE_HEIGHT = 22.1;
const DESKTOP_STEPPER_CORNER = "8px";

function withSeries(platform: "linux" | "android" | "ios"): FakeBackend {
  const series = sampleSeries(12);
  return {
    ...onPlatform(platform).backend,
    librarySeries: pagedSeries(() => series),
    librarySeriesCount: () => series.length,
  };
}

function cornerOf(locator: Locator): Promise<string> {
  return locator.evaluate(
    (element) => getComputedStyle(element).borderStartStartRadius,
  );
}

function emptyStateAddFolder(page: Page): Locator {
  return page
    .getByRole("region", { name: "Your library is empty" })
    .getByRole("button", { name: "Add a folder" });
}

test.describe("on a desktop", () => {
  test.use({ backend: withSeries("linux") });

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width < LARGE_MIN_WIDTH, "a desktop window");
  });

  test("rounds buttons to 10px", async ({ page }) => {
    await page.goto("/");
    const headingAddFolder = addFolderInPageHeading(page);
    const viewTrigger = viewOptionsButton(page);
    await expect(viewTrigger).toBeVisible();

    const headingCorner = await cornerOf(headingAddFolder);
    const viewCorner = await cornerOf(viewTrigger);
    await page.goto("/settings/library");
    const foldersCorner = await cornerOf(addFolderBesideFolders(page));
    await page.goto("/settings/about");
    const copyCorner = await cornerOf(
      page.getByRole("button", { name: "Copy version details" }),
    );

    expect([headingCorner, viewCorner, foldersCorner, copyCorner]).toEqual([
      BUTTON_CORNER,
      BUTTON_CORNER,
      BUTTON_CORNER,
      BUTTON_CORNER,
    ]);
  });

  test("keeps navigation rows at 8px", async ({ page }) => {
    await page.goto("/settings/library");

    const destination = page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Browse" });
    const section = page
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("link", { name: "Appearance" });

    expect(await cornerOf(destination)).toBe(ROW_CORNER);
    expect(await cornerOf(section)).toBe(ROW_CORNER);
  });

  test("draws the library heading's buttons 36px tall", async ({ page }) => {
    await page.goto("/");
    await expect(viewOptionsButton(page)).toBeVisible();

    const addFolder = await boxOf(addFolderInPageHeading(page));
    const view = await boxOf(viewOptionsButton(page));

    expect(addFolder.height).toBe(PAGE_BUTTON_HEIGHT);
    expect(view.height).toBe(PAGE_BUTTON_HEIGHT);
  });

  test("titles the View panel at 17px with a 1.3 line height", async ({
    page,
  }) => {
    await page.goto("/");

    const panel = await openViewOptions(page);
    const title = panel.getByRole("heading", { name: "View" });

    const lineHeight = await title.evaluate(
      (element) => getComputedStyle(element).lineHeight,
    );

    await expect(title).toHaveCSS("font-size", PANEL_TITLE_SIZE);
    expect(parseFloat(lineHeight)).toBeCloseTo(PANEL_TITLE_LINE_HEIGHT, 1);
  });

  test("keeps the View panel's stepper at 8px", async ({ page }) => {
    await page.goto("/");

    const panel = await openViewOptions(page);
    const stepper = panel.getByRole("group", { name: "Covers per row" });

    expect(await cornerOf(stepper)).toBe(DESKTOP_STEPPER_CORNER);
  });

  test("rounds keyboard keys to 6px", async ({ page }) => {
    await page.goto("/settings/privacy/screenshot-mode");

    const key = page.locator("kbd").first();

    expect(await cornerOf(key)).toBe(KEY_CORNER);
  });
});

test.describe("on an Android phone", () => {
  test.use(onPlatform("android"));

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
  });

  test("draws the empty library's Add a folder as a 52px pill", async ({
    page,
  }) => {
    await page.goto("/");
    const button = emptyStateAddFolder(page);

    const box = await boxOf(button);
    const corner = await cornerOf(button);

    expect(box.height).toBe(PHONE_BUTTON_HEIGHT);
    expect(parseFloat(corner)).toBeGreaterThanOrEqual(box.height / 2);
  });

  test.describe("with series", () => {
    test.use({ backend: withSeries("android") });

    test("rounds the View sheet's top corners to 24px", async ({ page }) => {
      await page.goto("/");

      const panel = await openViewOptions(page);

      expect(await cornerOf(panel)).toBe(SHEET_CORNER);
    });
  });
});

test.describe("on an iPhone", () => {
  test.use(onPlatform("ios"));

  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "phones only");
  });

  test("draws the empty library's Add a folder 52px tall with 14px corners", async ({
    page,
  }) => {
    await page.goto("/");
    const button = emptyStateAddFolder(page);

    const box = await boxOf(button);

    expect(box.height).toBe(PHONE_BUTTON_HEIGHT);
    expect(await cornerOf(button)).toBe(IOS_BUTTON_CORNER);
  });
});

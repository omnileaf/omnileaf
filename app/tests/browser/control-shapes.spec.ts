import type { Locator } from "@playwright/test";

import { addFolderBesideFolders, addFolderInPageHeading } from "./controls.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  expect,
  LARGE_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { openViewOptions, viewOptionsButton } from "./view-options.ts";

const BUTTON_CORNER = "10px";
const ROW_CORNER = "8px";
const KEY_CORNER = "6px";
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

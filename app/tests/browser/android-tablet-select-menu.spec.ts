import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";

const TABLET = { width: 820, height: 1180 };

test.use({ backend: { ...DEFAULT_BACKEND }, viewport: TABLET });

async function newSeriesMode(page: Page): Promise<Locator> {
  await page.goto("/settings/reading");
  const field = page.getByRole("combobox", {
    name: "Reading mode for new series",
  });
  await expect(field).toBeVisible();
  return field;
}

test.describe(
  "a shared select on an Android tablet",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Material's exposed dropdown menu");
    });

    test("opens the app's own menu under the field, the chosen mode ticked, instead of the system list", async ({
      page,
    }) => {
      const field = await newSeriesMode(page);

      await field.click();

      const menu = page.getByRole("listbox", {
        name: "Reading mode for new series",
      });
      const chosen = menu.getByRole("option", { selected: true });
      await expect(menu.getByRole("option")).toHaveCount(4);
      await expect(chosen).toContainText("Automatic");
      await expect(chosen.locator("svg")).toBeVisible();
      await expect(page.locator("select")).toHaveCount(0);
      const fieldBox = await boxOf(field);
      const menuBox = await boxOf(menu);
      expect(menuBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height);
      expect(menuBox.width).toBeGreaterThanOrEqual(fieldBox.width - 1);
    });

    test("takes the mode picked from the menu and closes it", async ({
      page,
    }) => {
      const field = await newSeriesMode(page);
      await field.click();

      await page.getByRole("option", { name: "Long strip" }).click();

      await expect(page.getByRole("listbox")).toBeHidden();
      await expect(field).toHaveText("Long strip");
    });

    test("closes only the menu on Back, staying on the settings page", async ({
      page,
    }) => {
      const field = await newSeriesMode(page);
      await field.click();
      await expect(page.getByRole("listbox")).toBeVisible();

      await page.goBack();

      await expect(page.getByRole("listbox")).toBeHidden();
      await expect(page).toHaveURL(/\/settings\/reading$/);
      await expect(field).toBeVisible();
    });

    test("keeps the field described by its help line", async ({ page }) => {
      const field = await newSeriesMode(page);

      await expect(field).toHaveAccessibleDescription(
        "Automatic picks paged or long strip from the details and the pages.",
      );
    });

    test("has no accessibility violations with the menu open", async ({
      page,
    }) => {
      await (await newSeriesMode(page)).click();
      await expect(page.getByRole("listbox")).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  },
);

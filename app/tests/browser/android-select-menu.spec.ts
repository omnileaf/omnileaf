import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";
import { BOOK_ID, readerBackend, servePages } from "./reader-book.ts";

const MENU_ITEM_PX = 48;
const READER_THEME = "dark";

test.use({ backend: readerBackend(DEFAULT_BACKEND) });

async function openReadingSettings(page: Page): Promise<Locator> {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await page
    .getByRole("button", { name: "Reading settings", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Reading settings" });
  await expect(sheet).toBeVisible();
  return sheet;
}

function readingMode(sheet: Locator): Locator {
  return sheet.getByRole("combobox", { name: "Reading mode" });
}

test.describe(
  "the Reading mode field on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Material's exposed dropdown menu");
    });

    test("opens the app's own menu under the field, the chosen mode ticked on a tinted pill", async ({
      page,
    }) => {
      const field = readingMode(await openReadingSettings(page));

      await field.click();

      const menu = page.getByRole("listbox");
      const chosen = menu.getByRole("option", { selected: true });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("option")).toHaveCount(4);
      await expect(chosen).toContainText("Automatic");
      await expect(chosen.locator("svg")).toBeVisible();
      await expect(chosen).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-menu-chosen", READER_THEME),
      );
      await expect(menu).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-menu", READER_THEME),
      );
      const fieldBox = await boxOf(field);
      const menuBox = await boxOf(menu);
      expect(menuBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height);
      expect((await boxOf(chosen)).height).toBeCloseTo(MENU_ITEM_PX, 0);
    });

    test("takes the mode chosen from the menu and closes it", async ({
      page,
    }) => {
      const field = readingMode(await openReadingSettings(page));
      await field.click();

      await page.getByRole("option", { name: "Right to left" }).click();

      await expect(page.getByRole("listbox")).toBeHidden();
      await expect(field).toContainText("Right to left");
    });

    test("is chosen from the keyboard as a listbox", async ({ page }) => {
      const field = readingMode(await openReadingSettings(page));
      await field.focus();

      await page.keyboard.press("Enter");
      await expect(page.getByRole("listbox")).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");

      await expect(page.getByRole("listbox")).toBeHidden();
      await expect(field).not.toContainText("Automatic");
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations with the menu open in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await readingMode(await openReadingSettings(page)).click();
        await expect(page.getByRole("listbox")).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  },
);

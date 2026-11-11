import type { Locator, Page } from "@playwright/test";

import { boxOf, expect, test, viewportOf } from "./fixtures.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

const KEYBOARD_HEIGHT = 336;

const shelf = new FakeShelf([
  { state: "read" },
  { state: "notStarted" },
  { state: "notStarted" },
  { state: "notStarted" },
]);

test.use({ backend: shelf.backend() });

function navigationBar(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" });
}

async function findABook(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await page.getByRole("button", { name: "Find a book" }).click();
  await expect(
    page.getByRole("searchbox", { name: "Find a book" }),
  ).toBeFocused();
}

async function showKeyboard(page: Page): Promise<void> {
  const { width, height } = viewportOf(page);
  await page.setViewportSize({ width, height: height - KEYBOARD_HEIGHT });
  await page.evaluate(() => {
    document.documentElement.toggleAttribute("data-keyboard-shown", true);
  });
}

async function hideKeyboard(page: Page): Promise<void> {
  const { width, height } = viewportOf(page);
  await page.evaluate(() => {
    document.documentElement.toggleAttribute("data-keyboard-shown", false);
  });
  await page.setViewportSize({ width, height: height + KEYBOARD_HEIGHT });
}

test.describe(
  "the navigation bar and the keyboard on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android reports the keyboard shown");
    });

    test("hides while the keyboard is up, so the page keeps the room above it", async ({
      page,
    }) => {
      await findABook(page);

      await showKeyboard(page);

      await expect(navigationBar(page)).toBeHidden();
      const main = await boxOf(page.getByRole("main"));
      expect(main.y + main.height).toBeCloseTo(viewportOf(page).height, 0);
    });

    test("comes back once the keyboard closes", async ({ page }) => {
      await findABook(page);
      await showKeyboard(page);
      await expect(navigationBar(page)).toBeHidden();

      await hideKeyboard(page);

      await expect(navigationBar(page)).toBeVisible();
    });
  },
);

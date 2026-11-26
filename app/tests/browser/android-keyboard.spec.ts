import type { Locator, Page } from "@playwright/test";

import { hideKeyboard, showKeyboard } from "./android-keyboard.ts";
import { boxOf, expect, test, viewportOf } from "./fixtures.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

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

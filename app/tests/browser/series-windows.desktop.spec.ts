import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  expect,
  testOnlyInItsWebview,
  test,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";
import { BUTTON_HEIGHT, colourOf, NO_SHADOW, THEMES } from "./windows-look.ts";

const WINDOW = { width: 1280, height: 800 };

test.describe("the series page on Windows", () => {
  testOnlyInItsWebview("windows");
  const shelf = new FakeShelf([
    { state: "read" },
    { state: "started", page: 15 },
    { state: "notStarted" },
  ]);
  test.use({
    viewport: WINDOW,
    platform: "windows",
    backend: shelf.backend(),
  });

  function side(page: Page): Locator {
    return page.getByRole("button", { name: /Reading|Unread|Read/ }).first();
  }

  for (const [colorScheme, look] of Object.entries(THEMES)) {
    test.describe(`in the ${colorScheme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({
          colorScheme: colorScheme as "light" | "dark",
        });
        await page.goto(`/series/${SERIES_ID}`);
        await expect(
          page.getByRole("button", { name: "Mark read" }),
        ).toBeVisible();
      });

      test("draws Mark read as a standard button 32 tall", async ({ page }) => {
        const button = page.getByRole("button", { name: "Mark read" });

        await expect(button).toHaveCSS("background-color", look.standard);
        expect((await boxOf(button)).height).toBe(BUTTON_HEIGHT);
      });

      test("draws the reading state and Tags as standard buttons 32 tall", async ({
        page,
      }) => {
        for (const button of [
          side(page),
          page.getByRole("button", { name: "Tags" }),
        ]) {
          expect((await boxOf(button)).height).toBe(BUTTON_HEIGHT);
        }
      });

      test("draws the Details card flat with a 1px stroke and 8px corners", async ({
        page,
      }) => {
        const card = page.getByRole("region", { name: "Details" });

        await expect(card).toHaveCSS("background-color", look.card);
        await expect(card).toHaveCSS("border-top-width", "1px");
        await expect(card).toHaveCSS(
          "border-top-color",
          await colourOf(page, "var(--windows-stroke)"),
        );
        await expect(card).toHaveCSS("border-top-left-radius", "8px");
        await expect(card).toHaveCSS("box-shadow", NO_SHADOW);
      });

      test("draws Show as a segmented control and Sort as an icon button named by its order", async ({
        page,
      }) => {
        const chosen = page.getByRole("radio", { name: "All" });
        const sort = page.getByRole("button", { name: /^Sort/ });

        await expect(chosen).toHaveCSS("border-top-left-radius", "4px");
        const sortBox = await boxOf(sort);
        expect(sortBox.width).toBe(sortBox.height);
        await expect(sort).toHaveAttribute("aria-label", "Sort: In order");
        await expect(sort).toHaveCSS("background-color", look.standard);
      });

      test("draws the way back and More in a narrow window as square subtle icon buttons", async ({
        page,
      }) => {
        await page.setViewportSize({ width: 700, height: 800 });
        const back = page.locator("[data-back-link]");
        const more = page.getByRole("button", { name: /More/ }).first();

        for (const control of [back, more]) {
          const box = await boxOf(control);
          expect(box.width).toBe(box.height);
          await expect(control).toHaveCSS(
            "background-color",
            "rgba(0, 0, 0, 0)",
          );
          await expect(control).toHaveCSS("border-top-left-radius", "4px");
        }
      });

      test("rules the book rows with the list rule colour", async ({
        page,
      }) => {
        const row = page.getByRole("row").nth(1);

        await expect(row).toHaveCSS(
          "border-bottom-color",
          await colourOf(page, "var(--native-color-row-rule)"),
        );
      });

      test("has no accessibility violations", async ({ page }) => {
        expect(await accessibilityViolations(page)).toEqual([]);
      });
    });
  }
});

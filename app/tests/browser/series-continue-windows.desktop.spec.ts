import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  expect,
  testOnlyInItsWebview,
  test,
} from "./fixtures.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";
import {
  BUTTON_HEIGHT,
  colourOf,
  escapedForPattern,
  NO_SHADOW,
  tabTo,
  THEMES,
} from "./windows-look.ts";

const WINDOW = { width: 1280, height: 800 };

test.describe("the series page's Continue card on Windows", () => {
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

  function card(page: Page): Locator {
    return page.getByRole("region", { name: "Continue", exact: true });
  }

  for (const [colorScheme, look] of Object.entries(THEMES)) {
    test.describe(`in the ${colorScheme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({
          colorScheme: colorScheme as "light" | "dark",
        });
        await page.goto(`/series/${SERIES_ID}`);
        await expect(card(page)).toBeVisible();
      });

      test("draws the card as a flat layer with a 1px stroke and 8px corners", async ({
        page,
      }) => {
        await expect(card(page)).toHaveCSS("background-color", look.card);
        await expect(card(page)).toHaveCSS("border-top-width", "1px");
        await expect(card(page)).toHaveCSS(
          "border-top-color",
          await colourOf(page, "var(--windows-stroke)"),
        );
        await expect(card(page)).toHaveCSS("border-top-left-radius", "8px");
        await expect(card(page)).toHaveCSS("box-shadow", NO_SHADOW);
      });

      test("draws Continue as the accent button", async ({ page }) => {
        const link = card(page).getByRole("link");

        await expect(link).toHaveCSS("background-color", look.accent);
        await expect(link).toHaveCSS("color", look.onAccent);
        expect((await boxOf(link)).height).toBe(BUTTON_HEIGHT);
        await tabTo(page, link);
        await expect(link).toHaveCSS("outline-width", "2px");
        await expect(link).toHaveCSS(
          "box-shadow",
          new RegExp(escapedForPattern(look.innerRing)),
        );
      });

      test("draws the progress as a 3 tall accent bar over a 1 tall track", async ({
        page,
      }) => {
        const bar = card(page).getByRole("progressbar");
        const fill = bar.locator("> div");

        expect((await boxOf(bar)).height).toBe(3);
        await expect(fill).toHaveCSS("background-color", look.accent);
        expect(
          await bar.evaluate((element) => {
            const track = getComputedStyle(element, "::before");
            return [track.height, track.backgroundColor];
          }),
        ).toEqual(["1px", look.progressTrack]);
      });

      test("has no accessibility violations", async ({ page }) => {
        expect(await accessibilityViolations(page)).toEqual([]);
      });
    });
  }

  test("draws the bar and Continue on system colours with forced colours on", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(`/series/${SERIES_ID}`);

    await expect(card(page).getByRole("link")).toHaveCSS(
      "background-color",
      await colourOf(page, "Highlight"),
    );
    await expect(
      card(page).getByRole("progressbar").locator("> div"),
    ).toHaveCSS("background-color", await colourOf(page, "Highlight"));
  });
});

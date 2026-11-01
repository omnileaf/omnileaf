import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import {
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  MEDIUM_MIN_WIDTH,
  settle,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { openSortAndFilter } from "./library-controls.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(3);
const FIRST_TITLE = LIBRARY[0]?.title ?? "";

const IOS_INK = {
  light: "rgb(0, 0, 0)",
  dark: "rgb(255, 255, 255)",
};

function showing(platform: Platform): { backend: typeof DEFAULT_BACKEND } {
  return {
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: () => fakeAppInfo(platform),
      librarySeries: () => ({ series: LIBRARY, next: null }),
      librarySeriesCount: () => LIBRARY.length,
    },
  };
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText(FIRST_TITLE, { exact: true })).toBeVisible();
}

function more(page: Page): Locator {
  return page.getByRole("main").getByRole("button", { name: "More" });
}

function search(page: Page): Locator {
  return page.getByRole("main").getByRole("link", { name: "Search" });
}

function sortAndFilter(page: Page): Locator {
  return page.getByRole("dialog", { name: "Sort and filter" });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`the iOS bar buttons in ${scheme}`, () => {
    test.use({ colorScheme: scheme, ...showing("ios") });

    test("draw the More icon in the primary label colour", async ({ page }) => {
      await openLibrary(page);

      await expect(more(page)).toHaveCSS("color", IOS_INK[scheme]);
    });

    test("draw the Search icon in the primary label colour", async ({
      page,
    }) => {
      test.skip(
        viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "iPads leave the bar row to the tab bar",
      );
      await openLibrary(page);

      await expect(search(page)).toHaveCSS("color", IOS_INK[scheme]);
    });

    test("draw a sheet's Close icon in the primary label colour", async ({
      page,
    }) => {
      test.skip(
        viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "iPads open Sort and filter beside the library",
      );
      await openLibrary(page);

      await openSortAndFilter(page);
      await settle(sortAndFilter(page));

      await expect(
        sortAndFilter(page).getByRole("button", { name: "Close" }),
      ).toHaveCSS("color", IOS_INK[scheme]);
    });
  });

  test.describe(`the iOS bar buttons with Increase Contrast in ${scheme}`, () => {
    test.use({ colorScheme: scheme, ...showing("ios") });

    test("keep the primary label colour", async ({ page }) => {
      await openLibrary(page);
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-contrast", "more");
      });

      await expect(more(page)).toHaveCSS("color", IOS_INK[scheme]);
    });
  });

  test.describe(`the Android bar buttons in ${scheme}`, () => {
    test.use({ colorScheme: scheme, ...showing("android") });

    test("keep Android's own ink", async ({ page }) => {
      test.skip(
        viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "Android's tablets draw plain bar icons",
      );
      await openLibrary(page);

      await expect(more(page)).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-bar-button"),
      );
    });
  });
}

import type { Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import {
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  literalColour,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import { openSortAndFilter } from "./library-controls.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(3);
const FIRST_TITLE = LIBRARY[0]?.title ?? "";
const BLACK = "rgb(0, 0, 0)";
const WHITE = "rgb(255, 255, 255)";

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

test.describe("iOS in dark", () => {
  test.use({ colorScheme: "dark", ...showing("ios") });

  test("sets the library on black with white words", async ({ page }) => {
    await openLibrary(page);

    await expect(page.locator("body")).toHaveCSS("background-color", BLACK);
    await expect(page.getByText(FIRST_TITLE, { exact: true })).toHaveCSS(
      "color",
      WHITE,
    );
  });

  test("sets the sort and filter sheet's title in white", async ({ page }) => {
    test.skip(
      viewportOf(page).width >= MEDIUM_MIN_WIDTH,
      "iPads open it as a popover",
    );
    await openLibrary(page);

    await openSortAndFilter(page);

    await expect(
      page.getByRole("heading", { name: "Sort and filter" }),
    ).toHaveCSS("color", WHITE);
  });
});

test.describe("other looks in dark", () => {
  test.describe("on Android", () => {
    test.use({ colorScheme: "dark", ...showing("android") });

    test("keeps the library on its own dark ground", async ({ page }) => {
      await openLibrary(page);

      await expect(page.locator("body")).toHaveCSS(
        "background-color",
        await literalColour(page, "oklch(0.145 0 0)"),
      );
      await expect(page.getByText(FIRST_TITLE, { exact: true })).toHaveCSS(
        "color",
        await literalColour(page, "oklch(0.985 0 0)"),
      );
    });
  });

  test.describe("on iOS in light", () => {
    test.use({ colorScheme: "light", ...showing("ios") });

    test("keeps the library on white with its own ink", async ({ page }) => {
      await openLibrary(page);

      await expect(page.locator("body")).toHaveCSS(
        "background-color",
        await literalColour(page, "oklch(1 0 0)"),
      );
      await expect(page.getByText(FIRST_TITLE, { exact: true })).toHaveCSS(
        "color",
        await literalColour(page, "oklch(0.145 0 0)"),
      );
    });
  });
});

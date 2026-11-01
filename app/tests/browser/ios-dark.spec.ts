import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import {
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  settle,
  test,
  tokenColour,
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

function sortAndFilter(page: Page): Locator {
  return page
    .getByRole("dialog", { name: "Sort and filter" })
    .or(page.getByRole("complementary", { name: "Sort and filter" }));
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

  test("sets the sort and filter title in white", async ({ page }) => {
    await openLibrary(page);

    await openSortAndFilter(page);
    await settle(sortAndFilter(page));

    await expect(
      sortAndFilter(page).getByRole("heading", { name: "Sort and filter" }),
    ).toHaveCSS("color", WHITE);
    await page.keyboard.press("Escape");
    await expect(sortAndFilter(page)).toBeHidden();
  });

  for (const [setting, value] of [
    ["contrast", "more"],
    ["transparency", "reduced"],
  ] as const) {
    test(`keeps black and white with ${setting} set to ${value}`, async ({
      page,
    }) => {
      await openLibrary(page);

      await page.evaluate(
        ([name, setTo]) => {
          document.documentElement.dataset[name] = setTo;
        },
        [setting, value] as const,
      );

      await expect(page.locator("body")).toHaveCSS("background-color", BLACK);
      await expect(page.getByText(FIRST_TITLE, { exact: true })).toHaveCSS(
        "color",
        WHITE,
      );
    });
  }

  test("sets a dark region inside the page on black too", async ({ page }) => {
    await openLibrary(page);

    const ground = await page.evaluate(() => {
      const region = document.createElement("div");
      region.dataset.theme = "dark";
      region.style.backgroundColor = "var(--background)";
      document.body.append(region);
      const painted = getComputedStyle(region).backgroundColor;
      region.remove();
      return painted;
    });

    expect(ground).toBe(BLACK);
  });
});

test.describe("other looks in dark", () => {
  for (const platform of ["android", "macos", "windows", "linux"] as const) {
    test.describe(`on ${platform}`, () => {
      test.use({ colorScheme: "dark", ...showing(platform) });

      test("keeps the library's own dark ground and ink", async ({ page }) => {
        await openLibrary(page);

        await expect(page.getByText(FIRST_TITLE, { exact: true })).toHaveCSS(
          "color",
          await tokenColour(page, "--foreground", "dark"),
        );
        await expect(page.locator("body")).toHaveCSS(
          "background-color",
          await tokenColour(page, "--background", "dark"),
        );
      });
    });
  }

  test.describe("on iOS in light", () => {
    test.use({ colorScheme: "light", ...showing("ios") });

    test("keeps the library on its light ground and ink", async ({ page }) => {
      await openLibrary(page);

      await expect(page.locator("body")).toHaveCSS(
        "background-color",
        await tokenColour(page, "--background", "light"),
      );
      await expect(page.getByText(FIRST_TITLE, { exact: true })).toHaveCSS(
        "color",
        await tokenColour(page, "--foreground", "light"),
      );
    });
  });
});

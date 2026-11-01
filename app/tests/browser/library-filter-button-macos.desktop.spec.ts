import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const WINDOW = { width: 1280, height: 800 };
const LIBRARY = sampleSeries(12);

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: WINDOW });

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
    libraryFilterChoices: () => ({
      formats: ["comic", "manga"],
      languages: [],
      tags: [],
      ratesAdult: false,
      keepsBookmarks: false,
      smart: [],
    }),
  },
});

function filterButton(page: Page, name = "Sort and filter"): Locator {
  return page.getByRole("button", { name, exact: true });
}

async function inkOf(button: Locator): Promise<string> {
  return button.evaluate((element) => getComputedStyle(element).color);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(LIBRARY.length);
});

test("keeps the toolbar ink while no filter is on", async ({ page }) => {
  const ink = await inkOf(filterButton(page));

  expect(ink).toBe(
    await tokenColour(page, "--native-color-on-button-secondary"),
  );
});

test("turns the accent colour while a filter is on", async ({ page }) => {
  await filterButton(page).click();
  await page.getByRole("button", { name: "Manga" }).click();
  const button = filterButton(page, "Sort and filter, 1 filter on");
  await page.mouse.move(0, 0);
  const accent = await tokenColour(page, "--native-color-on-button-link");

  await expect.poll(() => inkOf(button)).toBe(accent);
});

test("goes back to the toolbar ink when the filter is taken off", async ({
  page,
}) => {
  await filterButton(page).click();
  const manga = page.getByRole("button", { name: "Manga" });
  await manga.click();
  await manga.click();
  await page.mouse.move(0, 0);
  const ink = await tokenColour(page, "--native-color-on-button-secondary");

  await expect.poll(() => inkOf(filterButton(page))).toBe(ink);
});

for (const platform of ["windows", "linux"] as const) {
  test.describe(`on ${platform}`, () => {
    test.use({ platform });

    test("keeps the Filter button's own ink while a filter is on", async ({
      page,
    }) => {
      await filterButton(page).click();
      await page.getByRole("button", { name: "Manga" }).click();
      await page.mouse.move(0, 0);

      const button = page.getByRole("button", { name: /^Sort and filter/ });

      await expect
        .poll(() => inkOf(button))
        .not.toBe(await tokenColour(page, "--native-color-on-button-link"));
    });
  });
}

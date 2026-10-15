import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(12);

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
  } satisfies FakeBackend,
});

function moreButton(page: Page): Locator {
  return page.getByRole("button", { name: "More for the library" });
}

async function openMore(page: Page): Promise<Locator> {
  await page.goto("/");
  await moreButton(page).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}

test.describe("on a phone or tablet", () => {
  test.skip(({ hasTouch }) => !hasTouch, "desktops select from the covers");

  test("offers Select series, Edit categories and Library settings under More", async ({
    page,
  }) => {
    const menu = await openMore(page);

    await expect(menu.getByRole("menuitem")).toHaveText([
      "Select series",
      "Edit categories",
      "Library settings",
    ]);
  });

  test("starts selecting from Select series", async ({ page }) => {
    const menu = await openMore(page);

    await menu.getByRole("menuitem", { name: "Select series" }).click();

    await expect(page.getByText("0 selected").first()).toBeVisible();
  });

  for (const item of ["Edit categories", "Library settings"]) {
    test(`opens Settings › Library from ${item}`, async ({ page }) => {
      const menu = await openMore(page);

      await menu.getByRole("menuitem", { name: item }).click();

      await expect(page).toHaveURL(/\/settings\/library$/);
    });
  }

  test("has no accessibility violations with More open", async ({ page }) => {
    await openMore(page);

    expect(await accessibilityViolations(page)).toEqual([]);
  });
});

test("leaves More out of the desktop toolbar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.use.hasTouch === true, "phones keep More");
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Series" })).toBeVisible();

  await expect(moreButton(page)).toBeHidden();
});

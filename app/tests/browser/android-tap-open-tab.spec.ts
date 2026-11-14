import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

const STORED_KEY = "omnileaf.tapOpenTab";
const MANY_BOOKS = 40;
const SCROLLED_PX = 600;

test.use({
  backend: new FakeShelf(
    Array.from({ length: MANY_BOOKS }, () => ({
      state: "notStarted" as const,
    })),
  ).backend(),
});

function libraryTab(page: Page) {
  return page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Library" });
}

async function turnOn(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "on");
  }, STORED_KEY);
}

async function scrolledSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.locator("main").evaluate((main, by) => {
    main.scrollTo({ top: by });
  }, SCROLLED_PX);
  await expect
    .poll(() => page.locator("main").evaluate((main) => main.scrollTop))
    .toBeGreaterThan(0);
}

function scrollTopOf(page: Page): Promise<number> {
  return page.locator("main").evaluate((main) => main.scrollTop);
}

test.describe(
  "tapping the open tab again on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's navigation bar");
    });

    test("is a switch in Settings › Navigation, off until turned on", async ({
      page,
    }) => {
      await page.goto("/settings");

      await page.getByRole("link", { name: /^Navigation/ }).click();
      const choice = page.getByRole("switch", {
        name: "Tap the open tab again",
      });

      await expect(choice).not.toBeChecked();
      await expect(
        page.getByText(
          "Off, tapping the open tab does nothing. Back still goes one step.",
        ),
      ).toBeVisible();
    });

    test("is the same switch in Settings › Advanced", async ({ page }) => {
      await page.goto("/settings/navigation");
      await page
        .getByRole("switch", { name: "Tap the open tab again" })
        .click();

      await page.goto("/settings/advanced");

      await expect(
        page.getByRole("switch", { name: "Tap the open tab again" }),
      ).toBeChecked();
    });

    test("leaves a page inside the open section where it is while off", async ({
      page,
    }) => {
      await scrolledSeries(page);
      const scrolled = await scrollTopOf(page);

      await libraryTab(page).click();

      await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
      expect(await scrollTopOf(page)).toBe(scrolled);
    });

    test("scrolls a page inside the open section to its top first, then goes to the section's first page", async ({
      page,
    }) => {
      await turnOn(page);
      await scrolledSeries(page);

      await libraryTab(page).click();
      await expect.poll(() => scrollTopOf(page)).toBe(0);
      await expect(page).toHaveURL(new RegExp(`/series/${SERIES_ID}$`));
      await libraryTab(page).click();

      await expect(page).toHaveURL(/\/$/);
    });

    test("changes nothing at the top of the section's first page", async ({
      page,
    }) => {
      await turnOn(page);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const before = await page.evaluate(() => history.length);

      await libraryTab(page).click();

      await expect(page).toHaveURL(/\/$/);
      expect(await page.evaluate(() => history.length)).toBe(before);
    });
  },
);

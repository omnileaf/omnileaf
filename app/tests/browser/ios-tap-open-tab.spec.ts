import type { JSHandle, Page } from "@playwright/test";

import { expect, settle, test } from "./fixtures.ts";
import { sampleLibraryOn } from "./screens.ts";
import {
  historyPlaceOf,
  libraryShown,
  mainOf,
  openSeriesFromTheLibrary,
  pathOf,
  placeAfterAPlainBack,
  scrollLibraryDown,
  scrollTopsAfterTheTap,
  SETTINGS_TOP,
  tabOf,
} from "./tap-open-tab.ts";

test.use({ backend: sampleLibraryOn("ios") });

async function tapTab(page: Page, name: string): Promise<void> {
  await tabOf(page, name).tap();
}

function scrollMovesAskedOf(page: Page): Promise<JSHandle<string[]>> {
  return mainOf(page).evaluateHandle((main) => {
    const asked: string[] = [];
    const scrollTo = main.scrollTo.bind(main);
    Object.defineProperty(main, "scrollTo", {
      configurable: true,
      value: (options: ScrollToOptions) => {
        asked.push(options.behavior ?? "auto");
        scrollTo(options);
      },
    });
    return asked;
  });
}

test.describe("tapping the open tab on an iPhone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "ios", "the iPhone's tab bar");
  });

  test("goes back to the Library from a series opened in it, leaving history as a plain back does", async ({
    page,
  }) => {
    await page.goto("/");
    await libraryShown(page);
    const atTheLibrary = await historyPlaceOf(page);
    await openSeriesFromTheLibrary(page);
    const afterABack = placeAfterAPlainBack(
      await historyPlaceOf(page),
      atTheLibrary,
    );

    await tapTab(page, "Library");

    await expect.poll(() => pathOf(page)).toBe("/");
    await libraryShown(page);
    expect(await historyPlaceOf(page)).toEqual(afterABack);
    await expect(tabOf(page, "Library")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("goes back to Settings from Settings › Reader", async ({ page }) => {
    await page.goto(SETTINGS_TOP);
    await expect(
      page.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeVisible();
    const atSettings = await historyPlaceOf(page);
    await mainOf(page)
      .locator('a[href="/settings/reading"]')
      .filter({ visible: true })
      .click();
    await expect.poll(() => pathOf(page)).toBe("/settings/reading");
    const afterABack = placeAfterAPlainBack(
      await historyPlaceOf(page),
      atSettings,
    );

    await tapTab(page, "Settings");

    await expect.poll(() => pathOf(page)).toBe(SETTINGS_TOP);
    expect(await historyPlaceOf(page)).toEqual(afterABack);
  });

  test("scrolls the Library to its top with a glide, without opening it again", async ({
    page,
  }) => {
    await page.goto("/");
    await libraryShown(page);
    await scrollLibraryDown(page);
    const before = await historyPlaceOf(page);
    const asked = await scrollMovesAskedOf(page);

    const tops = await scrollTopsAfterTheTap(page, () =>
      tapTab(page, "Library"),
    );

    expect(tops.at(-1)).toBe(0);
    expect(await asked.jsonValue()).toEqual(["smooth"]);
    expect(await historyPlaceOf(page)).toEqual(before);
  });

  test("changes nothing at the top of the Library", async ({ page }) => {
    await page.goto("/");
    await libraryShown(page);
    const before = await historyPlaceOf(page);

    await tapTab(page, "Library");
    await settle(page.getByRole("navigation", { name: "Main" }));

    expect(await historyPlaceOf(page)).toEqual(before);
    expect(await mainOf(page).evaluate((main) => main.scrollTop)).toBe(0);
  });

  test("scrolls to the top at once with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await libraryShown(page);
    await scrollLibraryDown(page);
    const before = await historyPlaceOf(page);

    const tops = await scrollTopsAfterTheTap(page, () =>
      tapTab(page, "Library"),
    );

    expect(tops).toEqual([0]);
    expect(await historyPlaceOf(page)).toEqual(before);
  });
});

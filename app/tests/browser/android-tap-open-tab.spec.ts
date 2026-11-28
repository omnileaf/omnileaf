import type { Locator, Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import { ANIMATIONS_PREFERENCE_KEY } from "../../src/lib/appearance/animations.svelte.ts";
import { boxOf, expect, settle, test } from "./fixtures.ts";
import { touch } from "./library-frames.ts";
import { sampleLibraryOn } from "./screens.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";
import {
  type HistoryPlace,
  historyPlaceOf,
  libraryShown,
  mainOf,
  openSeriesFromTheLibrary,
  pathOf,
  placeAfterAPlainBack,
  scrollLibraryDown,
  scrollTopsAfterTheTap,
  SETTINGS_TOP,
  STORED_KEY,
  tabOf,
} from "./tap-open-tab.ts";

const LONG_PRESS_MS = 800;
const PILL_FRAMES_AFTER = 20;
const SHELF = new FakeShelf([{ state: "notStarted" }]);

test.use({ backend: sampleLibraryOn("android") });

async function tap(page: Page, target: Locator): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await touch(session, target);
  await session.detach();
}

async function tapTab(page: Page, name: string): Promise<void> {
  await tap(page, tabOf(page, name));
}

async function turnOff(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "off");
  }, STORED_KEY);
}

async function expectTabsStillNavigate(page: Page): Promise<void> {
  await tapTab(page, "Settings");
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeVisible();

  await tapTab(page, "Library");

  await expect.poll(() => pathOf(page)).toBe("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
}

async function libraryWithASeriesOpen(page: Page): Promise<HistoryPlace> {
  await page.goto("/");
  await libraryShown(page);
  const atTheLibrary = await historyPlaceOf(page);
  await openSeriesFromTheLibrary(page);
  return placeAfterAPlainBack(await historyPlaceOf(page), atTheLibrary);
}

test.describe(
  "the Tap the open tab again switch on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's navigation bar");
    });

    test("is on in Settings › Advanced until turned off, and says what a tap does", async ({
      page,
    }) => {
      await page.goto("/settings");

      await page.getByRole("link", { name: /^Advanced/ }).click();
      const choice = page.getByRole("switch", {
        name: english.tap_open_tab,
      });

      await expect(choice).toBeChecked();
      await expect(page.getByText(english.tap_open_tab_on_note)).toBeVisible();
    });

    test("says a tap does nothing once turned off", async ({ page }) => {
      await page.goto("/settings/advanced");

      await page.getByRole("switch", { name: english.tap_open_tab }).click();

      await expect(page.getByText(english.tap_open_tab_off_note)).toBeVisible();
    });

    test("stays off for an install that turned it off before", async ({
      page,
    }) => {
      await turnOff(page);

      await page.goto("/settings/advanced");

      await expect(
        page.getByRole("switch", { name: english.tap_open_tab }),
      ).not.toBeChecked();
      await expect(page.getByText(english.tap_open_tab_off_note)).toBeVisible();
    });

    test("leaves Navigation out of the Settings list", async ({ page }) => {
      await page.goto("/settings");
      await expect(page.getByRole("link", { name: /^Advanced/ })).toBeVisible();

      await expect(page.getByRole("link", { name: /^Navigation/ })).toHaveCount(
        0,
      );
    });

    test("answers the old Settings › Navigation address with the missing page and a way to the library", async ({
      page,
    }) => {
      await page.goto("/settings/navigation");

      await expect(
        page.getByRole("heading", { name: english.problem_page_missing_title }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: english.problem_go_to_library }),
      ).toBeVisible();
    });
  },
);

test.describe(
  "tapping the open tab on a page under it on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's navigation bar");
    });

    test("goes back to the Library from a series opened in it, leaving history as a plain back does", async ({
      page,
    }) => {
      const afterABack = await libraryWithASeriesOpen(page);

      await tapTab(page, "Library");

      await expect.poll(() => pathOf(page)).toBe("/");
      await libraryShown(page);
      expect(await historyPlaceOf(page)).toEqual(afterABack);
      await expect(tabOf(page, "Library")).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    test("goes to the Library from a series opened from History, leaving no entry behind it", async ({
      page,
    }) => {
      await page.goto("/");
      await libraryShown(page);
      const atTheLibrary = await historyPlaceOf(page);
      await tapTab(page, "History");
      await expect(
        page.getByRole("heading", { level: 1, name: "History" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: /^More for / })
        .first()
        .click();
      await page
        .getByRole("menuitem", { name: english.history_open_the_series })
        .click();
      await expect.poll(() => pathOf(page)).toMatch(/^\/series\//);
      const afterABack = placeAfterAPlainBack(
        await historyPlaceOf(page),
        atTheLibrary,
      );

      await tapTab(page, "Library");

      await expect.poll(() => pathOf(page)).toBe("/");
      await libraryShown(page);
      expect(await historyPlaceOf(page)).toEqual(afterABack);
    });

    for (const { name, way } of [
      { name: "Settings › Reader", way: ["/settings/reading"] },
      {
        name: "Settings › Library › Library tabs",
        way: ["/settings/library", "/settings/library/tabs"],
      },
    ]) {
      test(`goes back to Settings from ${name}`, async ({ page }) => {
        await page.goto(SETTINGS_TOP);
        await expect(
          page.getByRole("heading", { level: 1, name: "Settings" }),
        ).toBeVisible();
        const atSettings = await historyPlaceOf(page);
        for (const link of way) {
          await mainOf(page)
            .locator(`a[href="${link}"]`)
            .filter({ visible: true })
            .click();
          await expect.poll(() => pathOf(page)).toBe(link);
        }
        const afterABack = placeAfterAPlainBack(
          await historyPlaceOf(page),
          atSettings,
        );

        await tapTab(page, "Settings");

        await expect.poll(() => pathOf(page)).toBe(SETTINGS_TOP);
        await expect(
          page.getByRole("heading", { level: 1, name: "Settings" }),
        ).toBeVisible();
        expect(await historyPlaceOf(page)).toEqual(afterABack);
      });
    }

    test("goes to the Library from Enter on the focused tab, focusing what a back focuses", async ({
      page,
    }) => {
      await libraryWithASeriesOpen(page);
      await page.goBack();
      await libraryShown(page);
      const focusedByBack = await page.evaluate(
        () => document.activeElement?.outerHTML,
      );
      await openSeriesFromTheLibrary(page);

      await tabOf(page, "Library").focus();
      await page.keyboard.press("Enter");

      await expect.poll(() => pathOf(page)).toBe("/");
      await libraryShown(page);
      expect(await page.evaluate(() => document.activeElement?.outerHTML)).toBe(
        focusedByBack,
      );
    });

    test("keeps the tab's pill drawn on every frame of the tap", async ({
      page,
    }) => {
      await libraryWithASeriesOpen(page);
      const frames = await tabOf(page, "Library").evaluateHandle((link) => {
        const pill = link.querySelector('[data-slot="navigation-pill"]');
        const seen: number[] = [];
        const record = () => {
          seen.push(pill === null ? 0 : Number(getComputedStyle(pill).opacity));
          requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
        return seen;
      });

      await tapTab(page, "Library");
      await expect.poll(() => pathOf(page)).toBe("/");
      const arrivedAt = await frames.evaluate((seen) => seen.length);
      await expect
        .poll(() => frames.evaluate((seen) => seen.length))
        .toBeGreaterThan(arrivedAt + PILL_FRAMES_AFTER);

      expect(
        (await frames.jsonValue()).filter((opacity) => opacity < 1),
      ).toEqual([]);
    });

    test("leaves nothing held or tinted after a long press on the tab", async ({
      page,
    }) => {
      await libraryWithASeriesOpen(page);
      const series = pathOf(page);
      const link = tabOf(page, "Library");
      const { x, y, width, height } = await boxOf(link);
      const session = await page.context().newCDPSession(page);

      await session.send("Input.synthesizeTapGesture", {
        x: x + width / 2,
        y: y + height / 2,
        duration: LONG_PRESS_MS,
        gestureSourceType: "touch",
      });
      await session.detach();
      await settle(page.getByRole("navigation", { name: "Main" }));

      await expect(
        page
          .getByRole("navigation", { name: "Main" })
          .locator("[data-held-press]"),
      ).toHaveCount(0);
      expect(pathOf(page)).toBe(series);
    });
  },
);

test.describe(
  "tapping the open tab over an overlay on an Android phone",
  { tag: "@native" },
  () => {
    test.use({ backend: SHELF.backend() });

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's navigation bar");
    });

    async function seriesOpenedDirectly(page: Page): Promise<HistoryPlace> {
      await page.goto(`/series/${SERIES_ID}`);
      await expect(
        page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
      ).toBeVisible();
      return historyPlaceOf(page);
    }

    async function topPageShown(page: Page): Promise<void> {
      await expect(
        page.getByRole("heading", { level: 1, name: "Library" }),
      ).toBeVisible();
    }

    test("closes an open menu on the first tap, as any tab does, and goes to the Library on the next", async ({
      page,
    }) => {
      const atTheSeries = await seriesOpenedDirectly(page);
      await page
        .getByRole("button", { name: `More for ${SERIES_TITLE}`, exact: true })
        .click();
      await expect(page.getByRole("menu")).toBeVisible();

      await tapTab(page, "Library");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await tapTab(page, "Library");

      await expect.poll(() => pathOf(page)).toBe("/");
      await topPageShown(page);
      expect((await historyPlaceOf(page)).index).toBe(atTheSeries.index);
      await expectTabsStillNavigate(page);
    });

    test("closes the find field and goes to the Library, and the tabs keep working", async ({
      page,
    }) => {
      const atTheSeries = await seriesOpenedDirectly(page);
      await page
        .getByRole("button", { name: english.series_find_book })
        .click();
      await expect(
        page.getByRole("searchbox", { name: english.series_find_book }),
      ).toBeFocused();

      await tapTab(page, "Library");

      await expect.poll(() => pathOf(page)).toBe("/");
      await topPageShown(page);
      expect((await historyPlaceOf(page)).index).toBe(atTheSeries.index);
      await expectTabsStillNavigate(page);
    });
  },
);

test.describe(
  "tapping the open tab on its first page on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's navigation bar");
    });

    test("scrolls the Library to its top, gliding, and keeps the chosen category tab", async ({
      page,
    }) => {
      await page.goto("/");
      await libraryShown(page);
      await page.getByRole("tab", { name: "Manga" }).click();
      await expect(
        page.getByRole("tab", { name: "Manga", selected: true }),
      ).toBeVisible();
      await scrollLibraryDown(page);
      const before = await historyPlaceOf(page);

      const tops = await scrollTopsAfterTheTap(page, () =>
        tapTab(page, "Library"),
      );

      expect(tops[0]).toBeGreaterThan(0);
      expect(tops.at(-1)).toBe(0);
      await expect(
        page.getByRole("tab", { name: "Manga", selected: true }),
      ).toBeVisible();
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

      const tops = await scrollTopsAfterTheTap(page, () =>
        tapTab(page, "Library"),
      );

      expect(tops).toEqual([0]);
    });

    test("scrolls to the top at once with navigation movement turned off", async ({
      page,
    }) => {
      await page.addInitScript((key) => {
        localStorage.setItem(key, "navigation");
      }, ANIMATIONS_PREFERENCE_KEY);
      await page.goto("/");
      await libraryShown(page);
      await scrollLibraryDown(page);

      const tops = await scrollTopsAfterTheTap(page, () =>
        tapTab(page, "Library"),
      );

      expect(tops).toEqual([0]);
    });
  },
);

test.describe(
  "tapping the open tab with the switch off on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(async ({ page, platform }) => {
      test.skip(platform !== "android", "Android's navigation bar");
      await turnOff(page);
    });

    test("leaves a series opened from the Library where it is", async ({
      page,
    }) => {
      await libraryWithASeriesOpen(page);
      const series = await historyPlaceOf(page);
      const path = pathOf(page);

      await tapTab(page, "Library");
      await settle(page.getByRole("navigation", { name: "Main" }));

      expect(pathOf(page)).toBe(path);
      expect(await historyPlaceOf(page)).toEqual(series);
    });

    test("leaves the scrolled Library where it is", async ({ page }) => {
      await page.goto("/");
      await libraryShown(page);
      await scrollLibraryDown(page);
      const scrolled = await mainOf(page).evaluate((main) => main.scrollTop);

      await tapTab(page, "Library");
      await settle(page.getByRole("navigation", { name: "Main" }));

      expect(await mainOf(page).evaluate((main) => main.scrollTop)).toBe(
        scrolled,
      );
    });
  },
);

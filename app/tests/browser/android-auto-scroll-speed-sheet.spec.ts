import type { Locator, Page } from "@playwright/test";

import {
  bar,
  holdClockStill,
  scrollTopOf,
  startAutoScroll,
  TOOLBAR_TUCKS_MS,
} from "./auto-scroll.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import { openLongStrip, tallStripBackend } from "./reader-book.ts";

const LOOK_KEY = "omnileaf.readerSettings.all";
const FEW_SECONDS_MS = 2000;

test.use({ backend: tallStripBackend(DEFAULT_BACKEND) });

function readout(page: Page, screens: number): Locator {
  return bar(page).getByRole("button", {
    name: `Auto scroll speed, ${String(screens)} screens a minute`,
  });
}

function speedSheet(page: Page): Locator {
  return page.getByRole("dialog", { name: "Auto scroll speed" });
}

async function startAutoScrollAtASetSpeed(page: Page): Promise<void> {
  await page.clock.install();
  await openLongStrip(page, {
    [LOOK_KEY]: JSON.stringify({ autoScrollSpeed: "set" }),
  });
  await startAutoScroll(page);
}

test.describe(
  "The Android auto scroll readout's speed sheet",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's auto scroll readout");
    });

    test("opens Auto scroll speed from the readout and changes its speed line", async ({
      page,
    }) => {
      await startAutoScrollAtASetSpeed(page);

      await readout(page, 3).click();
      const sheet = speedSheet(page);
      await sheet.getByRole("slider", { name: "Screens a minute" }).focus();
      await page.keyboard.press("ArrowRight");

      await expect(sheet).toContainText("Screens a minute: 4");
      await expect(
        sheet.getByRole("radio", { name: "This series" }),
      ).toBeVisible();
      await expect(
        sheet.getByRole("button", { name: "Use the default (3)" }),
      ).toBeVisible();
      await page.goBack();
      await expect(readout(page, 4)).toBeVisible();
      await expect(
        bar(page).getByText("4 screens a minute", { exact: true }),
      ).toBeVisible();
    });

    test("pauses while the sheet is open, picks up after Back and still tucks the toolbar away after a tap", async ({
      page,
    }) => {
      await startAutoScrollAtASetSpeed(page);
      await holdClockStill(page);
      await readout(page, 3).click();
      await expect(speedSheet(page)).toBeVisible();
      const opened = await scrollTopOf(page);

      await page.clock.runFor(FEW_SECONDS_MS);
      expect(await scrollTopOf(page)).toBe(opened);
      await page.goBack();
      await page.clock.runFor(TOOLBAR_TUCKS_MS);

      await expect(speedSheet(page)).toBeHidden();
      await expect(bar(page)).toBeHidden();
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
      expect(await scrollTopOf(page)).toBeGreaterThan(opened);
    });

    test("puts focus back on the readout after Back when a key opened the sheet", async ({
      page,
    }) => {
      await startAutoScrollAtASetSpeed(page);
      await readout(page, 3).focus();
      await page.keyboard.press("Enter");
      await expect(speedSheet(page)).toBeVisible();

      await page.goBack();

      await expect(speedSheet(page)).toBeHidden();
      await expect(readout(page, 3)).toBeFocused();
    });

    test("stays paused after the sheet when it was paused before", async ({
      page,
    }) => {
      await startAutoScrollAtASetSpeed(page);
      await bar(page).getByRole("button", { name: "Pause" }).click();
      await holdClockStill(page);
      const paused = await scrollTopOf(page);
      await readout(page, 3).click();
      await expect(speedSheet(page)).toBeVisible();

      await page.goBack();
      await page.clock.runFor(FEW_SECONDS_MS);

      await expect(speedSheet(page)).toBeHidden();
      await expect(
        bar(page).getByRole("button", { name: "Play" }),
      ).toBeVisible();
      expect(await scrollTopOf(page)).toBe(paused);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no accessibility violations with the speed sheet open in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await startAutoScrollAtASetSpeed(page);

        await readout(page, 3).click();
        await expect(speedSheet(page)).toBeVisible();

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    }
  },
);

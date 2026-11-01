import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import {
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  MEDIUM_MIN_WIDTH,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(3);
const FIRST_TITLE = LIBRARY[0]?.title ?? "";

const BADGE_HEIGHT_PX = 20;

const IOS_BADGE = {
  light: { fill: "rgb(155, 44, 44)", label: "rgb(255, 255, 255)" },
  dark: { fill: "rgb(240, 140, 140)", label: "rgb(42, 14, 14)" },
};

const BOARD_BADGE_WEIGHT = "590";

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

async function openLibrary(page: Page): Promise<Locator> {
  await page.goto("/");
  await expect(page.getByText(FIRST_TITLE, { exact: true })).toBeVisible();
  return page.getByRole("img", { name: "1 unread" }).first();
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`the cover count badge on an iPhone in ${scheme}`, () => {
    test.use({ colorScheme: scheme, ...showing("ios") });

    test.beforeEach(({ page }) => {
      test.skip(
        viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "iPads keep their own badge",
      );
    });

    test("fills with the red badge colour and writes its count in the colour made for it", async ({
      page,
    }) => {
      const badge = await openLibrary(page);

      await expect(badge).toHaveCSS("background-color", IOS_BADGE[scheme].fill);
      await expect(badge).toHaveCSS("color", IOS_BADGE[scheme].label);
    });

    test("sets its count in semibold tabular numerals", async ({ page }) => {
      const badge = await openLibrary(page);

      await expect(badge).toHaveCSS("font-weight", BOARD_BADGE_WEIGHT);
      await expect(badge).toHaveCSS("font-variant-numeric", "tabular-nums");
    });

    test("rounds into a capsule 20 high with no blur behind it", async ({
      page,
    }) => {
      const badge = await openLibrary(page);

      await expect(badge).toHaveCSS(
        "min-height",
        `${String(BADGE_HEIGHT_PX)}px`,
      );
      const corner = await badge.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
      );
      expect(corner).toBeGreaterThanOrEqual(BADGE_HEIGHT_PX / 2);
      await expect(badge).toHaveCSS("backdrop-filter", "none");
    });
  });

  test.describe(`the cover count badge on an iPad in ${scheme}`, () => {
    test.use({ colorScheme: scheme, ...showing("ios") });

    test("keeps the accent badge", async ({ page }) => {
      test.skip(
        viewportOf(page).width < MEDIUM_MIN_WIDTH,
        "iPhones draw the red badge",
      );
      const badge = await openLibrary(page);

      await expect(badge).toHaveCSS(
        "background-color",
        await tokenColour(page, "--color-accent"),
      );
      await expect(badge).toHaveCSS(
        "color",
        await tokenColour(page, "--color-on-accent"),
      );
    });
  });

  test.describe(`the cover count badge on Android in ${scheme}`, () => {
    test.use({ colorScheme: scheme, ...showing("android") });

    test("keeps the green cover badge", async ({ page }) => {
      test.skip(
        viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "tablets keep their own badge",
      );
      const badge = await openLibrary(page);

      await expect(badge).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-cover-badge"),
      );
    });
  });
}

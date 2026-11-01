import type { Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test, tokenColour } from "./fixtures.ts";

const HOME = {
  id: "1",
  kind: "home",
  name: "Omnileaf",
  location: "Internal storage › Documents › Omnileaf",
  isAvailable: true,
} as const;

const LINK_HEADING = "Already have comics or books?";
const HERO_ICON_SIZE = 32;
const PLAIN_BUTTON_WEIGHT = "500";
const TRANSPARENT = "rgba(0, 0, 0, 0)";

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    firstLaunchFinished: () => false,
    libraryFolders: () => ({ folders: [HOME], next: null }),
  },
});

async function goToTheLinkStep(page: Page): Promise<void> {
  await page.goto("/first-launch");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: LINK_HEADING }),
  ).toBeVisible();
}

test.describe(
  "the link folders step on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's setup steps");
    });

    test("sets the step icon bare over the headline, in the accent, with no round badge", async ({
      page,
    }) => {
      await goToTheLinkStep(page);
      const hero = page
        .getByRole("heading", { level: 1, name: LINK_HEADING })
        .locator("xpath=preceding-sibling::*[1]");
      const icon = hero.locator("svg");

      const box = await icon.boundingBox();

      expect([box?.width, box?.height]).toEqual([
        HERO_ICON_SIZE,
        HERO_ICON_SIZE,
      ]);
      await expect(icon).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-button-plain"),
      );
      await expect(hero.locator("span").first()).toHaveCSS(
        "background-color",
        TRANSPARENT,
      );
    });

    test("sets Skip as a plain text button in the accent", async ({ page }) => {
      await goToTheLinkStep(page);
      const skip = page.getByRole("button", { name: /^Skip/ });

      await expect(skip).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-button-plain"),
      );
      await expect(skip).toHaveCSS("font-weight", PLAIN_BUTTON_WEIGHT);
      await expect(skip).toHaveCSS("background-color", TRANSPARENT);
    });
  },
);

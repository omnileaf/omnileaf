import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";
import { sampleLibraryOn, serveSampleArt } from "./screens.ts";
import { openViewOptions } from "./view-options.ts";

function stackSwitch(options: Locator): Locator {
  return options.getByRole("switch", { name: "Stack series covers" });
}

function sheets(page: Page): Locator {
  return page
    .getByRole("list", { name: "Series" })
    .locator('[data-slot="cover-sheet"]');
}

test.use({ backend: sampleLibraryOn("android") });

test.describe(
  "Series covers on an Android phone's library",
  { tag: "@native" },
  () => {
    test.beforeEach(async ({ page, platform }) => {
      test.skip(platform !== "android", "Android phones' covers");
      await serveSampleArt(page);
    });

    test("start flat, with Stack series covers off", async ({ page }) => {
      await page.goto("/");
      await expect(
        page
          .getByRole("list", { name: "Series" })
          .getByRole("listitem")
          .first(),
      ).toBeVisible();

      const options = await openViewOptions(page);

      await expect(stackSwitch(options)).not.toBeChecked();
      await expect(sheets(page)).toHaveCount(0);
    });

    test("stack once Stack series covers is turned on", async ({ page }) => {
      await page.goto("/");
      const options = await openViewOptions(page);

      await stackSwitch(options).click();

      await expect(stackSwitch(options)).toBeChecked();
      await expect(sheets(page).first()).toBeAttached();
    });
  },
);

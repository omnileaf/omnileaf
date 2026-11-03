import { boxOf, expect, MEDIUM_MIN_WIDTH, test } from "./fixtures.ts";
import {
  APP_STORAGE_HOME,
  goToTheHomeStep,
  picker,
  pickingAHome,
} from "./home-picker.ts";

const TABLET = { width: MEDIUM_MIN_WIDTH + 100, height: 1000 };

test.use({ backend: pickingAHome() });

test.beforeEach(({ platform }) => {
  test.skip(platform !== "android", "Android's folder picker");
  picker.reset();
  picker.isFirstLaunch = true;
});

test.describe(
  "the Home folder card on the first launch of an Android tablet",
  { tag: "@native" },
  () => {
    test.use({ viewport: TABLET });

    test("shows the path in a bordered chip below the title", async ({
      page,
    }) => {
      await goToTheHomeStep(page);

      const path = page.locator("code", { hasText: APP_STORAGE_HOME.location });
      const title = page
        .getByRole("region", { name: "Home folder" })
        .getByRole("heading", { name: "Home folder" });
      await expect(path).toHaveCSS("border-top-width", "1px");
      expect((await boxOf(path)).y).toBeGreaterThanOrEqual(
        (await boxOf(title)).y + (await boxOf(title)).height,
      );
    });
  },
);

test.describe(
  "the Home folder card on the first launch of an Android phone",
  { tag: "@native" },
  () => {
    test("shows the path under the title with no chip", async ({ page }) => {
      await goToTheHomeStep(page);

      const path = page.locator("code", { hasText: APP_STORAGE_HOME.location });
      await expect(path).toBeVisible();
      await expect(path).toHaveCSS("border-top-width", "0px");
    });
  },
);

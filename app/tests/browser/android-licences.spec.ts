import { DEFAULT_BACKEND, expect, test, tokenColour } from "./fixtures.ts";

test.use({ backend: { ...DEFAULT_BACKEND } });

test.describe(
  "Open-source licences on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list rows");
    });

    test("heads each licence in the accent at 14px", async ({ page }) => {
      await page.goto("/settings/about/licences");
      const heading = page.getByRole("heading", { level: 2 }).first();

      await expect(heading).toHaveCSS("font-size", "14px");
      await expect(heading).toHaveCSS("font-weight", "500");
      await expect(heading).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-button-plain"),
      );
    });

    test("lists the packages in regular weight, with no chevrons", async ({
      page,
    }) => {
      await page.goto("/settings/about/licences");
      const row = page
        .locator('main a[href^="/settings/about/licences/"]')
        .first();

      await expect(row.locator("bdi")).toHaveCSS("font-weight", "400");
      await expect(row.locator("svg:visible")).toHaveCount(0);
    });
  },
);

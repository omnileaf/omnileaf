import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";
import { sampleLibraryOn, serveSampleArt } from "./screens.ts";

function seriesTile(page: Page, title: string) {
  return page
    .getByRole("list", { name: "Series" })
    .getByRole("listitem")
    .filter({ hasText: title });
}

test.describe(
  "The count under each series name on Android",
  { tag: "@native" },
  () => {
    test.use({ backend: sampleLibraryOn("android") });

    test.beforeEach(async ({ page, platform }) => {
      test.skip(platform !== "android", "Android counts volumes and chapters");
      await serveSampleArt(page);
    });

    test("counts volumes and chapters as the folder has them", async ({
      page,
    }) => {
      await page.goto("/");

      await expect(seriesTile(page, "Sample Series 01")).toContainText(
        "12 volumes",
      );
      await expect(seriesTile(page, "Sample Series 11")).toContainText(
        "154 chapters",
      );
      await expect(seriesTile(page, "Sample Series 01")).not.toContainText(
        "books",
      );
    });
  },
);

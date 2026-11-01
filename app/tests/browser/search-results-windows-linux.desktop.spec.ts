import type { Page } from "@playwright/test";

import {
  DEFAULT_BACKEND,
  expect,
  literalColour,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const FOUND = sampleSeries(3);
const SECOND = FOUND[1];

async function searchForSeries(page: Page) {
  await page.goto("/search");
  await page
    .getByRole("combobox", { name: "Search your library" })
    .fill("series");
  return page.getByRole("listbox", { name: "Series found" });
}

for (const platform of ["windows", "linux"] as const) {
  test.describe(`on ${platform}`, () => {
    testOnlyInItsWebview(platform);
    test.use({
      platform,
      viewport: { width: 1280, height: 800 },
      backend: {
        ...DEFAULT_BACKEND,
        librarySearch: () => ({ series: FOUND, next: null }),
        librarySearchCount: () => FOUND.length,
      },
    });

    test("opens a result with a single click, as it always has", async ({
      page,
    }) => {
      expect(SECOND).toBeDefined();
      const found = await searchForSeries(page);

      await found.getByRole("option").nth(1).click();

      await expect(page).toHaveURL(new RegExp(`/series/${SECOND?.id ?? "-"}$`));
    });

    test("marks the words found on the chip fill, as it always has", async ({
      page,
    }) => {
      const found = await searchForSeries(page);

      await expect(found.locator("mark").first()).toHaveCSS(
        "background-color",
        await literalColour(page, "var(--color-chip)"),
      );
    });
  });
}

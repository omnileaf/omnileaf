import type { Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const HELD_MS = 800;
const LIBRARY = sampleSeries(9);

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

async function startSelecting(page: Page): Promise<void> {
  await page.goto("/");
  await expect(seriesList(page).getByRole("listitem")).toHaveCount(
    LIBRARY.length,
  );
  const link = seriesList(page).getByRole("listitem").nth(1).getByRole("link");
  const touch = { pointerType: "touch", pointerId: 3, isPrimary: true };
  await link.first().dispatchEvent("pointerdown", touch);
  await page.waitForTimeout(HELD_MS);
  const picked = seriesList(page).getByRole("checkbox", {
    name: LIBRARY[1]?.title ?? "",
  });
  await picked.dispatchEvent("pointerup", touch);
  await picked.dispatchEvent("click");
  await expect(page.getByText("1 selected").first()).toBeVisible();
}

test.describe(
  "selecting series on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's Material top bar");
    });

    test("sets the count at title large, 22px on a 28px line in regular weight", async ({
      page,
    }) => {
      await startSelecting(page);
      const count = page.getByText("1 selected").first();

      await expect(count).toHaveCSS("font-size", "22px");
      await expect(count).toHaveCSS("line-height", "28px");
      await expect(count).toHaveCSS("font-weight", "400");
    });
  },
);

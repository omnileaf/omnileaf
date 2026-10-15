import type { Locator, Page } from "@playwright/test";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const SERIES_PER_LETTER = 100;
const LETTERS = 26;
const THOUSANDS = sampleSeries(SERIES_PER_LETTER * LETTERS).map(
  (series, index) => ({
    ...series,
    title: `${String.fromCharCode(65 + Math.floor(index / SERIES_PER_LETTER))} ${series.title}`,
  }),
);
const LAST = THOUSANDS.at(-1)?.title ?? "";

function backendWith(catalog: typeof THOUSANDS): FakeBackend {
  return {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => catalog),
    librarySeriesCount: () => catalog.length,
  };
}

function handle(page: Page): Locator {
  return page.locator("[data-fast-scroll-handle]");
}

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

test.describe("with thousands of series", () => {
  test.use({ backend: backendWith(THOUSANDS) });

  test("offers a fast-scroll handle beside the covers", async ({ page }) => {
    await page.goto("/");
    await expect(seriesList(page)).toContainText(THOUSANDS[0]?.title ?? "");

    await expect(handle(page)).toBeVisible();
  });

  test("drags to the end of the library, showing the letter on the way", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(handle(page)).toBeVisible();
    const box = await handle(page).boundingBox();
    if (box === null) {
      throw new Error("the handle is not on screen");
    }
    const viewport = page.viewportSize();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2,
      (viewport?.height ?? 800) - 2,
      {
        steps: 12,
      },
    );

    await expect(page.locator("[data-fast-scroll-letter]")).toHaveText("Z");
    await page.mouse.up();
    await expect(seriesList(page)).toContainText(LAST, { timeout: 15_000 });
  });
});

test.describe("with a few series", () => {
  test.use({ backend: backendWith(THOUSANDS.slice(0, 12)) });

  test("offers no fast-scroll handle", async ({ page }) => {
    await page.goto("/");
    await expect(seriesList(page)).toContainText(THOUSANDS[0]?.title ?? "");

    await expect(handle(page)).toHaveCount(0);
  });
});

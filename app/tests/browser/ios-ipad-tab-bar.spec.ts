import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  testOnlyInItsWebview,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(9);
const TAB_BAR_HEIGHT_PX = 44;
const TOP_BAND_PX = 120;
const SAME_ROW_TOLERANCE_PX = 2;
const MANY_SERIES = 40;
const SCROLLED_PX = 600;

function mainBar(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" });
}

test.describe("the tab bar on an iPad", () => {
  testOnlyInItsWebview("ios");
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      ...onPlatform("ios").backend,
      librarySeries: () => ({ series: LIBRARY, next: null }),
      librarySeriesCount: () => LIBRARY.length,
    },
  });
  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "iPads only");
  });

  test("sits at the top of the page, centred, as a 44 high capsule of text tabs", async ({
    page,
  }) => {
    await page.goto("/");

    const bar = await boxOf(mainBar(page));

    expect(bar.y).toBeLessThan(TOP_BAND_PX);
    expect(bar.height).toBeCloseTo(TAB_BAR_HEIGHT_PX, 0);
    expect(bar.x + bar.width / 2).toBeCloseTo(viewportOf(page).width / 2, 0);
    await expect(mainBar(page).getByRole("link")).toHaveCount(4);
    await expect(mainBar(page).locator("svg")).toHaveCount(0);
    await expect(
      mainBar(page).getByRole("link", { name: "Library" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("opens another section from its tab", async ({ page }) => {
    await page.goto("/");

    await mainBar(page).getByRole("link", { name: "History" }).click();

    await expect(page).toHaveURL(/\/history$/);
    await expect(
      mainBar(page).getByRole("link", { name: "History" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("holds the library's Search and More on the bar's row at the trailing end, with the large title under", async ({
    page,
  }) => {
    await page.goto("/");

    const [bar, search, more, title] = await Promise.all([
      boxOf(mainBar(page)),
      boxOf(page.getByRole("link", { name: "Search", exact: true })),
      boxOf(page.getByRole("button", { name: "More for the library" })),
      boxOf(page.getByRole("heading", { level: 1, name: "Library" })),
    ]);

    expect(search.x).toBeGreaterThan(bar.x + bar.width);
    expect(more.x).toBeGreaterThan(search.x);
    expect(more.y + more.height / 2).toBeCloseTo(bar.y + bar.height / 2, 0);
    expect(title.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  });
});

test.describe("History on an iPad", () => {
  testOnlyInItsWebview("ios");
  test.use({ backend: onPlatform("ios").backend });

  test("holds Search and Clear on the bar's row at the trailing end at every width", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "iPads only");
    await page.goto("/history");

    const [bar, search, clear] = await Promise.all([
      boxOf(mainBar(page)),
      boxOf(page.getByRole("button", { name: "Search History" })),
      boxOf(page.getByRole("button", { name: "Clear History" })),
    ]);

    expect(search.x).toBeGreaterThan(bar.x + bar.width);
    expect(clear.x).toBeGreaterThan(search.x);
    expect(clear.y + clear.height / 2).toBeCloseTo(bar.y + bar.height / 2, 0);
  });
});

test.describe("scrolling the library on an iPad", () => {
  testOnlyInItsWebview("ios");
  test.use({
    backend: {
      ...onPlatform("ios").backend,
      librarySeries: pagedSeries(() => sampleSeries(MANY_SERIES)),
      librarySeriesCount: () => MANY_SERIES,
    },
  });

  test("leaves the bar row to the tab bar instead of folding the title into it", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "iPads only");
    await page.goto("/");
    await expect(page.getByRole("list", { name: "Series" })).toBeVisible();

    await page.getByRole("main").evaluate((main, top) => {
      main.scrollTo({ top });
    }, SCROLLED_PX);

    await expect(
      page.locator("[data-title-bar]").getByText("Library", { exact: true }),
    ).toHaveCSS("opacity", "0");
    await expect(mainBar(page)).toBeVisible();
  });
});

test.describe("the tab bar off an iPad", () => {
  test.use({ backend: { ...DEFAULT_BACKEND } });

  test.describe("on an iPhone", () => {
    testOnlyInItsWebview("ios");
    test.use({ backend: onPlatform("ios").backend });

    test("keeps the floating bar at the bottom with its icons", async ({
      page,
    }) => {
      test.skip(viewportOf(page).width >= MEDIUM_MIN_WIDTH, "iPhones only");
      await page.goto("/");

      const bar = await boxOf(mainBar(page));

      expect(bar.y).toBeGreaterThan(viewportOf(page).height / 2);
      await expect(mainBar(page).locator("svg")).toHaveCount(4);
    });
  });

  test.describe("on Android", () => {
    testOnlyInItsWebview("android");
    test.use({ backend: onPlatform("android").backend });

    test("keeps its bottom bar on a phone and its side rail on a tablet", async ({
      page,
    }) => {
      await page.goto("/");

      const bar = await boxOf(mainBar(page));
      const { width, height } = viewportOf(page);

      if (width < MEDIUM_MIN_WIDTH) {
        expect(bar.y).toBeGreaterThan(height / 2);
      } else {
        expect(bar.x).toBeLessThan(SAME_ROW_TOLERANCE_PX);
        expect(bar.height).toBeGreaterThan(height / 2);
      }
      await expect(mainBar(page).locator("svg")).toHaveCount(4);
    });
  });
});

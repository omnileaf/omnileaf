import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  testOnlyInItsWebview,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const LIBRARY = sampleSeries(9);
const TAB_BAR_HEIGHT_PX = 44;
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

    const [bar, main] = await Promise.all([
      boxOf(mainBar(page)),
      boxOf(page.getByRole("main")),
    ]);
    const pageTop = await page
      .getByRole("main")
      .evaluate((element) => parseFloat(getComputedStyle(element).paddingTop));

    expect(bar.y).toBeCloseTo(main.y + pageTop, 0);
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

  test("rings a tab inside its capsule when the keyboard reaches it", async ({
    page,
  }) => {
    await page.goto("/");
    const library = mainBar(page).getByRole("link", { name: "Library" });

    await page.keyboard.press("Tab");
    await library.focus();

    await expect(library).toBeFocused();
    await expect(library).toHaveCSS("outline-style", "solid");
    await expect(library).toHaveCSS("outline-offset", "-5px");
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

test.describe("a page inside a section on an iPad", () => {
  testOnlyInItsWebview("ios");
  const shelf = new FakeShelf([{ state: "notStarted" }]);
  test.use({
    backend: {
      ...onPlatform("ios").backend,
      seriesOverview: (id) => shelf.backend().seriesOverview(id),
      seriesBooks: (id, listing, after) =>
        shelf.backend().seriesBooks(id, listing, after),
    },
  });
  test.beforeEach(({ page }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "iPads only");
  });

  test("keeps the search field clear of the tab bar", async ({ page }) => {
    await page.goto("/search");

    const field = page.getByRole("combobox", { name: "Search your library" });
    await expect(field).toBeVisible();
    const [bar, box] = await Promise.all([boxOf(mainBar(page)), boxOf(field)]);

    expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    await field.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(page).toHaveURL(/\/search/);
    await expect(field).toBeFocused();
  });

  for (const [name, path, chosen] of [
    ["search", "/search", "Library"],
    ["a series", `/series/${SERIES_ID}`, "Library"],
    ["a Settings page", "/settings/general", "Settings"],
  ] as const) {
    test(`keeps the tab bar in the middle of the bar on ${name}, with ${chosen} chosen`, async ({
      page,
    }) => {
      await page.goto(path);

      const bar = mainBar(page);
      await expect(bar).toBeVisible();
      const box = await boxOf(bar);

      expect(box.x + box.width / 2).toBeCloseTo(viewportOf(page).width / 2, 0);
      expect(box.height).toBeCloseTo(TAB_BAR_HEIGHT_PX, 0);
      await expect(bar.getByRole("link", { name: chosen })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  }

  test("holds Back at the bar's leading end and More at its trailing end on a series", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES_ID}`);

    const [bar, back, more] = await Promise.all([
      boxOf(mainBar(page)),
      boxOf(page.getByRole("link", { name: "Back to the library" })),
      boxOf(page.getByRole("button", { name: `More for ${SERIES_TITLE}` })),
    ]);

    expect(back.x + back.width).toBeLessThanOrEqual(bar.x);
    expect(more.x).toBeGreaterThanOrEqual(bar.x + bar.width);
    expect(back.y + back.height / 2).toBeCloseTo(bar.y + bar.height / 2, 0);
    expect(more.y + more.height / 2).toBeCloseTo(bar.y + bar.height / 2, 0);
  });

  test("draws a Settings page's Back as a glass circle level with the bar", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= EXPANDED_MIN_WIDTH,
      "the sections are listed beside it on wide screens",
    );
    await page.goto("/settings/general");

    const back = page.getByRole("link", { name: "Back to Settings" });
    const [bar, box] = await Promise.all([boxOf(mainBar(page)), boxOf(back)]);

    expect(box.width).toBeCloseTo(box.height, 0);
    expect(box.x + box.width).toBeLessThanOrEqual(bar.x);
    expect(box.y + box.height / 2).toBeCloseTo(bar.y + bar.height / 2, 0);
    await expect(back).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-bar-button"),
    );
  });

  test("opens another section from the tab bar on a series", async ({
    page,
  }) => {
    await page.goto(`/series/${SERIES_ID}`);

    await mainBar(page).getByRole("link", { name: "History" }).click();

    await expect(page).toHaveURL(/\/history$/);
  });

  test("leaves the tab bar off the reader", async ({ page }) => {
    await page.goto(`/read/${shelf.idOf(0)}`);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(mainBar(page)).toHaveCount(0);
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

  test("folds the title into a small centred line under the tab bar", async ({
    page,
  }) => {
    test.skip(viewportOf(page).width < MEDIUM_MIN_WIDTH, "iPads only");
    await page.goto("/");
    await expect(page.getByRole("list", { name: "Series" })).toBeVisible();

    await page.getByRole("main").evaluate((main, top) => {
      main.scrollTo({ top });
    }, SCROLLED_PX);
    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).not.toBeInViewport();
    await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      await Promise.all(document.getAnimations().map((a) => a.finished));
    });

    const titleBar = page.locator("[data-title-bar]");
    const folded = titleBar.getByText("Library", { exact: true });
    await expect(titleBar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(folded).toHaveCSS("opacity", "1");
    const [bar, title] = await Promise.all([
      boxOf(mainBar(page)),
      boxOf(folded),
    ]);
    expect(title.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    expect(title.x + title.width / 2).toBeCloseTo(
      viewportOf(page).width / 2,
      0,
    );
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
      await expect(mainBar(page).locator("svg, [data-icon]")).toHaveCount(4);
    });
  });
});

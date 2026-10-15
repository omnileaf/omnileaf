import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  fakeAppInfo,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const SIDEBAR_WIDTH = 256;
const HIDDEN_SIDEBAR_WIDTH = 56;
const ITEM_HEIGHT = 32;
const TOOLBAR_HEIGHT = 56;
const TOOLBAR_TITLE_SIZE = "16px";
const SERIES = sampleSeries(60);

const LIBRARY_BACKEND = {
  ...DEFAULT_BACKEND,
  librarySeries: pagedSeries(() => SERIES),
  librarySeriesCount: () => SERIES.length,
};

function navigation(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" });
}

function toolbar(page: Page): Locator {
  return page.locator("[data-page-toolbar]");
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  test.skip(
    viewportOf(page).width < EXPANDED_MIN_WIDTH ||
      test.info().project.use.isMobile === true,
    "the desktop's sidebar",
  );
  await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
}

test.describe("on a desktop", () => {
  test.use({ backend: LIBRARY_BACKEND });

  test("lists the sections in a 256px sidebar with 32px rows", async ({
    page,
  }) => {
    await openLibrary(page);
    const library = navigation(page).getByRole("link", { name: "Library" });

    const sidebar = await boxOf(navigation(page));
    const row = await boxOf(library);

    expect(sidebar.width).toBe(SIDEBAR_WIDTH);
    expect(row.height).toBe(ITEM_HEIGHT);
    await expect(navigation(page)).toHaveCSS(
      "background-color",
      await tokenColour(page, "--sidebar"),
    );
    await expect(library).toHaveCSS(
      "background-color",
      await tokenColour(page, "--sidebar-accent"),
    );
    await expect(library).toHaveCSS("font-weight", "500");
  });

  test("hides the sidebar to its icons and brings it back", async ({
    page,
  }) => {
    await openLibrary(page);

    await page.getByRole("button", { name: "Hide the sidebar" }).click();

    expect((await boxOf(navigation(page))).width).toBe(HIDDEN_SIDEBAR_WIDTH);
    await expect(
      navigation(page).getByRole("link", { name: "History" }),
    ).toBeVisible();
    await page.reload();
    expect((await boxOf(navigation(page))).width).toBe(HIDDEN_SIDEBAR_WIDTH);
    await page.getByRole("button", { name: "Show the sidebar" }).click();
    expect((await boxOf(navigation(page))).width).toBe(SIDEBAR_WIDTH);
  });

  test("hides and shows the sidebar with Ctrl B", async ({ page }) => {
    await openLibrary(page);

    await page.keyboard.press("Control+b");

    expect((await boxOf(navigation(page))).width).toBe(HIDDEN_SIDEBAR_WIDTH);
    await page.keyboard.press("Control+b");
    expect((await boxOf(navigation(page))).width).toBe(SIDEBAR_WIDTH);
  });

  test("puts the page's title and tools in a 56px toolbar that stays as the page scrolls", async ({
    page,
  }) => {
    await openLibrary(page);
    const title = page.getByRole("heading", { level: 1, name: "Library" });

    await page.locator("main").evaluate((main) => {
      main.scrollTo({ top: 600 });
    });

    const bar = await boxOf(toolbar(page));
    expect(bar.height).toBe(TOOLBAR_HEIGHT);
    expect(bar.y).toBe(0);
    await expect(title).toHaveCSS("font-size", TOOLBAR_TITLE_SIZE);
    await expect(title).toHaveCSS("font-weight", "600");
    await expect(title).toBeInViewport();
  });

  test("has no accessibility violations with the sidebar hidden", async ({
    page,
  }) => {
    await openLibrary(page);
    await page.getByRole("button", { name: "Hide the sidebar" }).click();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
});

test.describe("on macOS", () => {
  test.use({
    backend: { ...LIBRARY_BACKEND, appInfo: () => fakeAppInfo("macos") },
  });

  test("hides and shows the sidebar with ⌘ B", async ({ page }) => {
    await openLibrary(page);

    await page.keyboard.press("Meta+b");

    expect((await boxOf(navigation(page))).width).toBe(HIDDEN_SIDEBAR_WIDTH);
  });
});

for (const width of [800, 520]) {
  test.describe(`in a ${String(width)}px desktop window`, () => {
    test.use({ backend: LIBRARY_BACKEND });

    test.beforeEach(async ({ page }) => {
      test.skip(
        test.info().project.use.isMobile === true,
        "a desktop window with a pointer",
      );
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
    });

    test("keeps the toolbar and folds the sidebar to its icons", async ({
      page,
    }) => {
      const sidebar = await boxOf(navigation(page));
      const bar = await boxOf(toolbar(page));

      expect(sidebar.width).toBe(HIDDEN_SIDEBAR_WIDTH);
      expect(sidebar.x).toBe(0);
      expect(bar.height).toBe(TOOLBAR_HEIGHT);
      await expect(
        page.getByRole("heading", { level: 1, name: "Library" }),
      ).toHaveCSS("font-size", TOOLBAR_TITLE_SIZE);
      await expect(
        navigation(page).getByRole("link", { name: "Library" }),
      ).toHaveCSS(
        "background-color",
        await tokenColour(page, "--sidebar-accent"),
      );
    });

    test("names each icon in a tooltip while the pointer rests on it", async ({
      page,
    }) => {
      const browse = navigation(page).getByRole("link", { name: "Browse" });
      await browse.hover();

      const tooltip = page.locator("[data-tooltip-content]");
      await expect(tooltip).toHaveText("Browse");
      const link = await boxOf(browse);
      expect((await boxOf(tooltip)).x).toBeGreaterThanOrEqual(
        link.x + link.width,
      );
    });
  });
}

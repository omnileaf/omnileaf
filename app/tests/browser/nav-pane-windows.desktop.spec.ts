import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const OPEN_PANE = 320;
const COMPACT_PANE = 48;
const WINDOW_HEIGHT = 800;
const WIDE_WINDOW = 1280;
const COMPACT_WINDOWS = [1007, 700];
const SERIES = sampleSeries(12);

const ON_WINDOWS = {
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => SERIES),
    librarySeriesCount: () => SERIES.length,
    appInfo: () => fakeAppInfo("windows"),
  },
};

function pane(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" });
}

async function openLibraryAt(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: WINDOW_HEIGHT });
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
}

async function paneWidth(page: Page): Promise<number> {
  return Math.round((await boxOf(pane(page))).width);
}

test.describe("on Windows", () => {
  testOnlyInItsWebview("windows");
  test.use(ON_WINDOWS);

  test("opens the navigation pane 320 wide and folds it to 48 with Ctrl B, kept between launches", async ({
    page,
  }) => {
    await openLibraryAt(page, WIDE_WINDOW);
    expect(await paneWidth(page)).toBe(OPEN_PANE);

    await page.keyboard.press("Control+b");

    expect(await paneWidth(page)).toBe(COMPACT_PANE);
    await page.reload();
    expect(await paneWidth(page)).toBe(COMPACT_PANE);
    await page.keyboard.press("Control+b");
    expect(await paneWidth(page)).toBe(OPEN_PANE);
  });

  test("leaves Ctrl B without effect while the pane is compact, so it does not fold the pane later", async ({
    page,
  }) => {
    await openLibraryAt(page, COMPACT_WINDOWS[0] ?? 0);

    await page.keyboard.press("Control+b");
    await page.setViewportSize({ width: WIDE_WINDOW, height: WINDOW_HEIGHT });

    expect(await paneWidth(page)).toBe(OPEN_PANE);
  });

  test("holds the window's one pane toggle at the top of the pane", async ({
    page,
  }) => {
    await openLibraryAt(page, WIDE_WINDOW);
    const toggles = page.getByRole("button", { name: "Hide the sidebar" });

    await expect(toggles).toHaveCount(1);
    await expect(
      pane(page).getByRole("button", { name: "Hide the sidebar" }),
    ).toHaveAttribute("aria-keyshortcuts", "Control+B");
    await toggles.click();
    expect(await paneWidth(page)).toBe(COMPACT_PANE);
  });

  test("walks the pane with the arrow keys and opens a section with Enter", async ({
    page,
  }) => {
    await openLibraryAt(page, WIDE_WINDOW);
    const history = pane(page).getByRole("link", { name: "History" });
    await pane(page).getByRole("link", { name: "Library" }).focus();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(history).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/history$/);
    await expect(history).toHaveAttribute("aria-current", "page");
  });

  for (const width of COMPACT_WINDOWS) {
    test(`folds the pane to 48 of icons in a ${String(width)} wide window and names each in a tooltip`, async ({
      page,
    }) => {
      await openLibraryAt(page, width);
      const browse = pane(page).getByRole("link", { name: "Browse" });

      await browse.hover();

      expect(await paneWidth(page)).toBe(COMPACT_PANE);
      expect(Math.round((await boxOf(page.getByRole("main"))).x)).toBe(
        COMPACT_PANE,
      );
      await expect(page.locator("[data-tooltip-content]")).toHaveText("Browse");
    });
  }

  test("lays the kit's pressed fill under an item while it is pressed", async ({
    page,
  }) => {
    await openLibraryAt(page, WIDE_WINDOW);
    const browse = pane(page).getByRole("link", { name: "Browse" });
    const centre = await boxOf(browse);

    await page.mouse.move(
      centre.x + centre.width / 2,
      centre.y + centre.height / 2,
    );
    await page.mouse.down();

    await expect(browse).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-nav-item-pressed"),
    );
    await page.mouse.up();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations with the pane open or folded in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openLibraryAt(page, WIDE_WINDOW);

      const open = await accessibilityViolations(page);
      await page.keyboard.press("Control+b");
      const folded = await accessibilityViolations(page);

      expect({ open, folded }).toEqual({ open: [], folded: [] });
    });
  }
});

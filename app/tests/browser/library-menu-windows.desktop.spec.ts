import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const BOOK = "0190a3e4-0000-8000-8000-0000000b0001";
const LIBRARY = sampleSeries(3).map((series, index) => ({
  ...series,
  unreadCount: 2,
  continuesFrom: index === 0 ? BOOK : null,
}));
const MENU_ENDING = ["Show in File Explorer", "Remove from library"];

test.describe("a series' context menu on Windows", () => {
  testOnlyInItsWebview("windows");
  test.use({
    platform: "windows",
    viewport: { width: 1280, height: 800 },
    backend: {
      ...DEFAULT_BACKEND,
      librarySeries: () => ({ series: [...LIBRARY], next: null }),
      librarySeriesCount: () => LIBRARY.length,
    },
  });

  async function rightClick(page: Page): Promise<Locator> {
    await page.goto("/");
    const link = page
      .getByRole("list", { name: "Series" })
      .getByRole("link")
      .first();
    await expect(link).toBeVisible();
    await link.click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    return menu;
  }

  test("ends with Show in File Explorer and Remove from library, in plain text", async ({
    page,
  }) => {
    const menu = await rightClick(page);
    const items = menu.getByRole("menuitem");
    const names = (await items.allTextContents()).map((name) => name.trim());

    expect(names.slice(-2)).toEqual(MENU_ENDING);
    await expect(items.last()).not.toHaveCSS("color", "rgb(196, 43, 28)");
  });

  test("asks before removing the series from the library", async ({ page }) => {
    const menu = await rightClick(page);

    await menu.getByRole("menuitem", { name: "Remove from library" }).click();

    await expect(page.getByRole("alertdialog")).toBeVisible();
  });
});

test.describe("the category tabs on Windows", () => {
  testOnlyInItsWebview("windows");
  test.use({
    platform: "windows",
    viewport: { width: 1280, height: 800 },
    backend: {
      ...DEFAULT_BACKEND,
      librarySeries: () => ({ series: [...LIBRARY], next: null }),
      librarySeriesCount: () => LIBRARY.length,
      libraryCategories: () => [
        { id: "manga", name: "Manga" },
        { id: "comics", name: "Comics" },
      ],
    },
  });

  test("underlines the chosen tab in the accent colour and no other", async ({
    page,
  }) => {
    await page.goto("/");
    const chosen = page.getByRole("tab", { selected: true });
    const other = page.getByRole("tab", { name: "Manga" });
    const underline = (tab: Locator) =>
      tab.evaluate((element) => {
        const line = getComputedStyle(element, "::after");
        return [line.opacity, line.height, line.backgroundColor];
      });

    expect(await underline(chosen)).toEqual(["1", "3px", "rgb(47, 111, 79)"]);
    expect((await underline(other))[0]).toBe("0");
  });
});

import type { Locator, Page } from "@playwright/test";

import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  viewportOf,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const HELD_MS = 800;
const LIBRARY = sampleSeries(9);

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    seriesLabels: () => ({
      keepsLabels: true,
      categories: [],
      tags: [],
      suggestedTags: [],
    }),
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

    test("takes the navigation bar's place with Categories, Tags and Mark as read while choosing", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(seriesList(page).getByRole("listitem")).toHaveCount(
        LIBRARY.length,
      );
      const nav = page.getByRole("navigation", { name: "Main" });
      const navBox = await boxOf(nav);

      await startSelecting(page);

      await expect(nav).toBeHidden();
      const bar = page.getByRole("group", { name: "Selected series" });
      const barBox = await boxOf(bar);
      expect(barBox.height).toBeCloseTo(navBox.height, 0);
      expect(barBox.y + barBox.height).toBeCloseTo(viewportOf(page).height, 0);
      for (const name of ["Categories", "Tags", "Mark as read"]) {
        await expect(bar.getByRole("button", { name })).toBeVisible();
      }
    });

    test("swaps the navigation bar for the action bar as soon as choosing starts, before anything is picked", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(seriesList(page).getByRole("listitem")).toHaveCount(
        LIBRARY.length,
      );

      await page.getByRole("button", { name: "More for the library" }).click();
      await page.getByRole("menuitem", { name: "Select series" }).click();

      await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
      const bar = page.getByRole("group", { name: "Selected series" });
      for (const name of ["Categories", "Tags", "Mark as read", "More"]) {
        await expect(bar.getByRole("button", { name })).toBeVisible();
        await expect(bar.getByRole("button", { name })).toBeDisabled();
      }
    });

    test("enables the action bar buttons once a series is chosen", async ({
      page,
    }) => {
      await startSelecting(page);

      const bar = page.getByRole("group", { name: "Selected series" });
      for (const name of ["Categories", "Tags", "Mark as read", "More"]) {
        await expect(bar.getByRole("button", { name })).toBeEnabled();
      }
    });

    test("keeps Delete out of the bar, three actions and a More button with a 24px three dots icon", async ({
      page,
    }) => {
      await startSelecting(page);
      const bar = page.getByRole("group", { name: "Selected series" });

      await expect(bar.getByRole("button")).toHaveText([
        "Categories",
        "Tags",
        "Mark as read",
        "More",
      ]);
      await expect(bar.getByRole("button", { name: "Delete" })).toHaveCount(0);
      const icon = bar
        .getByRole("button", { name: "More" })
        .locator("[data-icon]");
      await expect(icon).toHaveAttribute("data-icon", "ellipsis");
      expect((await boxOf(icon)).width).toBe(24);
    });

    test("opens a menu with Delete above the bar, and Delete asks before it removes anything", async ({
      page,
    }) => {
      await startSelecting(page);
      const bar = page.getByRole("group", { name: "Selected series" });

      await bar.getByRole("button", { name: "More" }).click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem")).toHaveText(["Delete"]);
      expect(
        (await boxOf(menu)).y + (await boxOf(menu)).height,
      ).toBeLessThanOrEqual((await boxOf(bar)).y);
      await menu.getByRole("menuitem", { name: "Delete" }).click();

      await expect(
        page.getByRole("alertdialog", { name: "Remove from your library?" }),
      ).toBeVisible();
    });

    test("has no accessibility violations with the More menu open", async ({
      page,
    }) => {
      await startSelecting(page);
      await page
        .getByRole("group", { name: "Selected series" })
        .getByRole("button", { name: "More" })
        .click();
      await expect(page.getByRole("menu")).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });

    test("fills an unchecked cover check box with the window colour inside a 2px outline", async ({
      page,
    }) => {
      await startSelecting(page);
      const box = seriesList(page)
        .getByRole("listitem")
        .first()
        .locator('[data-slot="selection-mark"]');

      await expect(box).toHaveCSS("background-color", "rgb(247, 250, 245)");
      await expect(box).toHaveCSS("border-top-width", "2px");
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

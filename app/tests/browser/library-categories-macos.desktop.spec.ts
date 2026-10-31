import type { Page } from "@playwright/test";

import type { LibraryCategory } from "../../src/lib/ipc/bindings.ts";
import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const WINDOW = { width: 1280, height: 800 };
const LIBRARY = sampleSeries(12);
const MANGA = LIBRARY.slice(0, 4);
const CATEGORIES = [
  { id: "manga", name: "Manga" },
  { id: "comics", name: "Comics" },
] as LibraryCategory[];

testOnlyInItsWebview("macos");
test.use({ platform: "macos", viewport: WINDOW });

function backendWith(categories: readonly LibraryCategory[]) {
  return {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    libraryCategories: () => [...categories],
    categorySeries: (
      category: string,
      after: Parameters<typeof DEFAULT_BACKEND.categorySeries>[1],
      listing: Parameters<typeof DEFAULT_BACKEND.categorySeries>[2],
    ) => pagedSeries(() => (category === "manga" ? MANGA : []))(after, listing),
    categorySeriesCount: (category: string) =>
      category === "manga" ? MANGA.length : 0,
  };
}

function sidebarCategories(page: Page) {
  return page
    .getByRole("navigation", { name: "Main" })
    .getByRole("list", { name: "Categories" });
}

test.describe("with two categories", () => {
  test.use({ backend: backendWith(CATEGORIES) });

  test("lists every category in the sidebar, names only, and no tabs in the page", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(sidebarCategories(page).getByRole("button")).toHaveText([
      "All",
      "Manga",
      "Comics",
    ]);
    await expect(page.getByRole("tablist", { name: "Categories" })).toHaveCount(
      0,
    );
  });

  test("shows the series of the category picked in the sidebar", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(sidebarCategories(page)).toBeVisible();

    await sidebarCategories(page)
      .getByRole("button", { name: "Manga" })
      .click();

    await expect(
      page.getByRole("list", { name: "Series" }).getByRole("listitem"),
    ).toHaveCount(MANGA.length);
    await expect(
      sidebarCategories(page).getByRole("button", { name: "Manga" }),
    ).toHaveAttribute("aria-current", "true");
  });
});

test.describe("with two categories in the view options", () => {
  test.use({ backend: backendWith(CATEGORIES) });

  test("offers Categories in the sidebar as a checkbox, not category tabs", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "View options", exact: true })
      .click();
    const options = page.getByRole("dialog", { name: "View options" });

    await expect(
      options.getByRole("checkbox", { name: /Categories in the sidebar/ }),
    ).toBeVisible();
    await expect(options.getByText("Category tabs")).toHaveCount(0);
  });
});

test.describe("with one category", () => {
  test.use({ backend: backendWith([CATEGORIES[0] as LibraryCategory]) });

  test("has no Categories section in the sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("list", { name: "Series" }).getByRole("listitem"),
    ).toHaveCount(LIBRARY.length);

    await expect(sidebarCategories(page)).toHaveCount(0);
  });
});

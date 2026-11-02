import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

testOnlyInItsWebview("macos");
test.use({
  platform: "macos",
  viewport: { width: 1280, height: 800 },
  backend: {
    ...DEFAULT_BACKEND,
    libraryCategories: () => [{ id: "manga", name: "Manga" }] as never,
    categorySeriesCount: () => 64,
    seriesLabels: () => ({
      keepsLabels: true,
      categories: [],
      tags: [],
      suggestedTags: [],
    }),
  },
});

test.beforeEach(async ({ page }) => {
  await page.goto("/settings/library/tabs");
});

test("calls the page Categories and the everything tab Library", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { level: 1, name: "Categories" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Categories" })
      .getByText("Library", { exact: true }),
  ).toBeVisible();
});

test("says Hiding a category never removes a series, with the Mac option key", async ({
  page,
}) => {
  await expect(
    page.getByText(
      "Drag to reorder, or use ⌥↑ and ⌥↓. Hiding a category never removes a series.",
    ),
  ).toBeVisible();
});

test("names New category with an ellipsis", async ({ page }) => {
  await expect(
    page.getByRole("button", { name: "New category…" }),
  ).toBeVisible();
});

test("offers Show in the sidebar in a hidden built-in category's menu", async ({
  page,
}) => {
  await page.getByRole("button", { name: "More for New chapters" }).click();

  await expect(
    page.getByRole("menuitem", { name: "Show in the sidebar" }),
  ).toBeVisible();
});

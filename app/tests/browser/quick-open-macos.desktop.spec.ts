import {
  DEFAULT_BACKEND,
  expect,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const WINDOW = { width: 1280, height: 800 };
const LIBRARY = sampleSeries(6);

testOnlyInItsWebview("macos");
test.use({
  platform: "macos",
  viewport: WINDOW,
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: LIBRARY, next: null }),
    librarySeriesCount: () => LIBRARY.length,
  },
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(LIBRARY.length);
  await page.keyboard.press("Meta+k");
  await expect(page.getByRole("dialog", { name: "Quick open" })).toBeVisible();
});

test("writes its key line with the Mac's keys", async ({ page }) => {
  const panel = page.getByRole("dialog", { name: "Quick open" });

  await expect(panel).toContainText("↩ to open");
  await expect(panel).toContainText("⇥ for the next group");
  await expect(panel.getByText("Enter to open")).toHaveCount(0);
  await expect(panel.getByText("Tab for the next group")).toHaveCount(0);
});

test("dims nothing behind the panel", async ({ page }) => {
  const overlay = page.locator("[data-dialog-overlay]");

  await expect(overlay).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("highlights the chosen row in the Mac menu highlight", async ({
  page,
}) => {
  const panel = page.getByRole("dialog", { name: "Quick open" });
  const active = panel
    .locator("[data-selected='true'], [aria-selected='true']")
    .first();

  await expect(active).toHaveCSS(
    "background-color",
    await tokenColour(page, "--native-color-menu-item-hover"),
  );
});

test("writes the search page's key line with the Mac's keys too", async ({
  page,
}) => {
  await page.keyboard.press("Escape");
  await page.goto("/search");

  await expect(page.getByText("↩ to open")).toBeVisible();
  await expect(page.getByText("Enter to open")).toHaveCount(0);
});

test("leads the search page with Back and the title Search, not a breadcrumb", async ({
  page,
}) => {
  await page.keyboard.press("Escape");
  await page.goto("/search");

  await expect(
    page.getByRole("link", { name: "Back to the library" }),
  ).toBeVisible();
  await expect(page.locator("[data-page-toolbar]")).toContainText("Search");
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toHaveCount(0);
});

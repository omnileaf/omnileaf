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
    librarySearch: () => ({ series: LIBRARY, next: null }),
    librarySearchCount: () => LIBRARY.length,
  },
});

test("holds the search field in the toolbar, ready to type in, and nowhere else", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(
    LIBRARY.length,
  );
  await page
    .getByRole("searchbox", { name: "Search the library" })
    .pressSequentially("s");
  const field = page
    .locator("[data-page-toolbar]")
    .getByRole("combobox", { name: "Search your library" });

  await expect(field).toBeFocused();
  await expect(page.getByRole("combobox")).toHaveCount(1);
});

test("sets the scope in a bar under the title bar, labelled Search in", async ({
  page,
}) => {
  await page.goto("/search");
  await page
    .getByRole("combobox", { name: "Search your library" })
    .fill("sample");
  const bar = page.getByRole("group", { name: "Search in" });

  await expect(bar).toBeVisible();
  await expect(bar).toContainText("Search in");
  await expect(bar).toHaveCSS("border-bottom-width", "1px");
  await expect(bar).toHaveCSS("padding-left", "20px");
  await expect(bar).toHaveCSS("column-gap", "6px");
});

test("fills the chosen scope and leaves the others plain, 20px at each side", async ({
  page,
}) => {
  await page.goto("/search");
  await page
    .getByRole("combobox", { name: "Search your library" })
    .fill("sample");
  const chosen = page.getByRole("button", { name: "Everything" });
  const other = page.getByRole("button", { name: "Manga" });

  await expect(chosen).toHaveCSS(
    "background-color",
    await tokenColour(page, "--native-color-control-fill-pressed"),
  );
  await expect(other).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(other).toHaveCSS("padding-left", "20px");
  await expect(other).toHaveCSS("padding-right", "20px");
});

test("narrows the search to the scope picked", async ({ page }) => {
  await page.goto("/search");
  await page
    .getByRole("combobox", { name: "Search your library" })
    .fill("sample");

  await page.getByRole("button", { name: "Manga" }).click();

  await expect(page.getByRole("button", { name: "Manga" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

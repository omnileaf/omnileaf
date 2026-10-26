import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const ACTION_ROW = 64;
const TITLE_ROW = 48;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => sampleSeries(40)),
    librarySeriesCount: () => 40,
    libraryView: () => ({ ...DEFAULT_LIBRARY_VIEW, showsItemCounts: true }),
  },
});

test.describe(
  "the library's top app bar on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's medium top app bar");
    });

    test("rests as a medium bar: actions on a 64 row, the title in headline small under them", async ({
      page,
    }) => {
      await page.goto("/");
      const bar = page.locator("[data-title-bar]");
      const title = page.getByRole("heading", { level: 1, name: "Library" });

      const row = await boxOf(bar);
      const heading = await boxOf(title);

      expect(row.height).toBeCloseTo(ACTION_ROW, 0);
      await expect(title).toHaveCSS("font-size", "24px");
      await expect(title).toHaveCSS("line-height", "32px");
      expect(heading.y).toBeCloseTo(row.y + row.height, 0);
      expect(heading.height + 16).toBeCloseTo(TITLE_ROW, 0);
      await expect(bar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    });

    test("collapses to the small bar on surface container as the page scrolls", async ({
      page,
    }) => {
      await page.goto("/");
      const bar = page.locator("[data-title-bar]");
      const barTitle = bar.getByText("Library", { exact: true });

      await page.getByRole("main").evaluate((main) => {
        main.scrollTo({ top: 600 });
      });

      await expect(barTitle).toHaveCSS("opacity", "1");
      await expect(barTitle).toHaveCSS("font-size", "22px");
      await expect(barTitle).toHaveCSS("text-align", "start");
      await expect(bar).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-top-bar-scrolled"),
      );
      expect((await boxOf(bar)).height).toBeCloseTo(ACTION_ROW, 0);
    });

    test("has no accessibility violations at rest", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { level: 1, name: "Library" }),
      ).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  },
);

import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  test,
  tokenColour,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const CATALOG = sampleSeries(6);
const CHIP_HEIGHT = 32;
const CHIP_RADIUS = "8px";
const CHIP_FONT = "14px";
const CHIP_LINE = "20px";
const CHIP_WEIGHT = "500";
const SCOPE_GAP = 8;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: CATALOG, next: null }),
    librarySearch: () => ({ series: CATALOG, next: null }),
    librarySearchCount: () => CATALOG.length,
  },
});

function scope(page: Page): Locator {
  return page.getByRole("group", { name: "Search in" });
}

async function openSearch(page: Page): Promise<Locator> {
  await page.goto("/search");
  await page
    .getByRole("main")
    .getByRole("combobox", { name: "Search your library" })
    .fill("sample");
  const chips = scope(page);
  await expect(chips).toBeVisible();
  return chips;
}

test.describe(
  "the library's search on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's Material search");
    });

    test("draws each scope as a 32px chip with an 8px corner and a 1px outline, 14px on a 20px line at 500", async ({
      page,
    }) => {
      const chips = await openSearch(page);
      const chip = chips.getByRole("button", { name: "Manga" });

      expect((await boxOf(chip)).height).toBeCloseTo(CHIP_HEIGHT, 0);
      await expect(chip).toHaveCSS("border-top-left-radius", CHIP_RADIUS);
      await expect(chip).toHaveCSS("border-top-width", "1px");
      await expect(chip).toHaveCSS("font-size", CHIP_FONT);
      await expect(chip).toHaveCSS("line-height", CHIP_LINE);
      await expect(chip).toHaveCSS("font-weight", CHIP_WEIGHT);
      await expect(chip).toHaveCSS(
        "border-top-color",
        await tokenColour(page, "--native-color-button-outline-edge"),
      );
    });

    test("fills the chosen scope with the soft accent and ticks it, leaving the others outlined", async ({
      page,
    }) => {
      const chips = await openSearch(page);
      const everything = chips.getByRole("button", { name: "Everything" });
      const manga = chips.getByRole("button", { name: "Manga" });

      await expect(everything).toHaveCSS(
        "background-color",
        await tokenColour(page, "--native-color-accent-soft"),
      );
      await expect(everything.locator("svg")).toHaveCount(1);
      await expect(manga.locator("svg")).toHaveCount(0);

      await manga.click();

      await expect(manga).toHaveAttribute("aria-pressed", "true");
      await expect(manga.locator("svg")).toHaveCount(1);
      await expect(everything.locator("svg")).toHaveCount(0);
    });

    test("sets the chips 8px apart in one row that scrolls sideways", async ({
      page,
    }) => {
      const chips = await openSearch(page);
      const first = await boxOf(
        chips.getByRole("button", { name: "Everything" }),
      );
      const second = await boxOf(chips.getByRole("button", { name: "Manga" }));

      expect(second.x - (first.x + first.width)).toBeCloseTo(SCOPE_GAP, 0);
      expect(second.y).toBeCloseTo(first.y, 0);
      await expect(chips).toHaveCSS("overflow-x", "auto");
    });
  },
);

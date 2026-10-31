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

const NOTHING = "nothing-here";

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: CATALOG, next: null }),
    librarySearch: (_after, search) => ({
      series: search.text.includes(NOTHING) ? [] : CATALOG,
      next: null,
    }),
    librarySearchCount: (search) =>
      search.text.includes(NOTHING) ? 0 : CATALOG.length,
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

    test("turns a typed filter into a 32px outlined chip inside the field, with an 18px cross that removes it", async ({
      page,
    }) => {
      await page.goto("/search");
      const field = page
        .getByRole("main")
        .getByRole("combobox", { name: "Search your library" });
      await field.fill("unread sample");
      const inField = field.locator("xpath=..");
      const chip = inField.getByRole("listitem").filter({ hasText: "Unread" });

      const chipBox = await boxOf(chip);
      const fieldBox = await boxOf(inField);
      const remove = chip.getByRole("button", {
        name: "Remove the Unread filter",
      });

      expect(chipBox.height).toBeCloseTo(CHIP_HEIGHT, 0);
      expect(chipBox.y).toBeGreaterThanOrEqual(fieldBox.y);
      expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(
        fieldBox.y + fieldBox.height,
      );
      await expect(chip).toHaveCSS("border-top-left-radius", CHIP_RADIUS);
      await expect(chip).toHaveCSS(
        "border-top-color",
        await tokenColour(page, "--native-color-button-outline-edge"),
      );
      expect((await boxOf(remove.locator("svg"))).width).toBeCloseTo(18, 0);

      await remove.click();

      await expect(chip).toHaveCount(0);
    });

    test("draws nothing found with a 48px muted search icon, a 22px title and 14px lines", async ({
      page,
    }) => {
      await page.goto("/search");
      await page
        .getByRole("main")
        .getByRole("combobox", { name: "Search your library" })
        .fill(NOTHING);
      const title = page.getByRole("heading", { name: /^Nothing matches/ });
      await expect(title).toBeVisible();

      await expect(title).toHaveCSS("font-size", "22px");
      await expect(title).toHaveCSS("line-height", "28px");
      await expect(title).toHaveCSS("font-weight", "400");
      const hint = page.getByText("Check the spelling", { exact: false });
      await expect(hint).toHaveCSS("font-size", "14px");
      await expect(hint).toHaveCSS("line-height", "20px");
      const icon = page.locator("[data-slot=empty-media] svg");
      expect((await boxOf(icon)).width).toBeCloseTo(48, 0);
      await expect(page.getByText("Coming with Browse.")).toHaveCSS(
        "font-size",
        "14px",
      );
    });

    test("centres each scope's label between the chip's top and bottom", async ({
      page,
    }) => {
      const chips = await openSearch(page);
      const chip = chips.getByRole("button", { name: "Manga" });

      const chipBox = await boxOf(chip);
      const labelBox = await boxOf(chip.locator("span").first());

      expect(labelBox.y + labelBox.height / 2).toBeCloseTo(
        chipBox.y + chipBox.height / 2,
        0,
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

    test("heads the results in the green accent at 14px on a 20px line at 500", async ({
      page,
    }) => {
      await openSearch(page);
      const heading = page.getByRole("heading", { name: /^Series and books/ });

      await expect(heading).toHaveCSS("font-size", "14px");
      await expect(heading).toHaveCSS("line-height", "20px");
      await expect(heading).toHaveCSS("font-weight", "500");
      await expect(heading).toHaveCSS(
        "color",
        await tokenColour(page, "--native-color-on-button-plain"),
      );
    });

    test("sets each result's title at 16px on a 24px line in regular weight, with the match a touch heavier and unfilled", async ({
      page,
    }) => {
      await openSearch(page);
      const row = page.getByRole("option").first();
      const title = row.locator("p").first();
      const match = row.locator("mark").first();

      await expect(title).toHaveCSS("font-size", "16px");
      await expect(title).toHaveCSS("line-height", "24px");
      await expect(title).toHaveCSS("font-weight", "400");
      await expect(match).toHaveCSS("font-weight", "500");
      await expect(match).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    });

    test("heads the start screen's sections in the green accent and sets its rows at 16px with 24px icons", async ({
      page,
    }) => {
      await page.goto("/search");

      for (const name of ["You can search for", "Type a filter to narrow"]) {
        const heading = page.getByRole("heading", { name });
        await expect(heading).toHaveCSS("font-size", "14px");
        await expect(heading).toHaveCSS("font-weight", "500");
        await expect(heading).toHaveCSS(
          "color",
          await tokenColour(page, "--native-color-on-button-plain"),
        );
      }
      const row = page.getByText("Title or series", { exact: true });
      await expect(row).toHaveCSS("font-size", "16px");
      await expect(row).toHaveCSS("line-height", "24px");
      expect(
        (
          await boxOf(
            page.locator("li", { hasText: "Title or series" }).locator("svg"),
          )
        ).width,
      ).toBeCloseTo(24, 0);
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

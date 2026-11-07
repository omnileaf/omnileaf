import type { Locator, Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
  targetOf,
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

const TABLET = { width: MEDIUM_MIN_WIDTH + 100, height: 1000 };
const NOTHING = "nothing-here";
const CHAPTER_HITS = [1, 2].map((position) => ({
  series: CATALOG[0]?.id ?? "",
  seriesTitle: CATALOG[0]?.title ?? "",
  book: `0190a3e4-0000-8000-8000-00000000010${String(position)}`,
  position,
  title: `Harbour chapter ${String(position)}`,
  matchedIn: "fileName" as const,
}));

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
    librarySearchChapters: () => ({
      hits: CHAPTER_HITS,
      next: null,
      count: CHAPTER_HITS.length,
    }),
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

    test("takes the whole screen, with the navigation bar gone and the dialog colour behind", async ({
      page,
    }) => {
      await page.goto("/search");

      await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
      await expect(page.locator("[data-search-bar]")).toBeVisible();
      await expect(page.locator("[data-search-view]")).toHaveCSS(
        "background-color",
        "rgb(226, 234, 226)",
      );
    });

    test("sets a flat 72px bar with a 1px divider under it, a 24px back arrow and no magnifier", async ({
      page,
    }) => {
      await page.goto("/search");
      const bar = page.locator("[data-search-bar]");
      const field = bar.getByRole("combobox").locator("xpath=..");

      expect((await boxOf(bar)).height).toBe(72);
      expect((await boxOf(bar)).width).toBe(page.viewportSize()?.width ?? 0);
      await expect(bar).toHaveCSS("border-bottom-width", "1px");
      await expect(field).toHaveCSS("border-top-left-radius", "0px");
      await expect(field).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(bar.locator("[data-icon='search']")).toHaveCount(0);
      expect((await boxOf(bar.locator("[data-icon='arrow-left']"))).width).toBe(
        24,
      );
    });

    test("keeps the 40px back arrow's touch area at 48px", async ({ page }) => {
      await page.goto("/search");
      const back = page.getByRole("link", { name: "Back to the library" });

      expect(await boxOf(back)).toMatchObject({ width: 40, height: 40 });
      expect(await targetOf(back)).toMatchObject({ width: 48, height: 48 });
    });

    test("clears the field with a 48px plain button and a 24px cross", async ({
      page,
    }) => {
      await page.goto("/search");
      const bar = page.locator("[data-search-bar]");
      await bar.getByRole("combobox").fill("sample");
      const clear = bar.getByRole("button", { name: "Clear" });

      expect(await boxOf(clear)).toMatchObject({ width: 48, height: 48 });
      await expect(clear).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      expect((await boxOf(clear.locator("[data-icon='x']"))).width).toBe(24);
    });

    test("lists the five things to search for with 24px icons 16px in and their words 56px in", async ({
      page,
    }) => {
      await page.goto("/search");
      const rows = page.getByRole("heading", { name: "You can search for" });
      const list = rows.locator("xpath=following-sibling::ul");

      await expect(list.getByRole("listitem")).toHaveText([
        /Title or series/,
        /Writer or artist/,
        /Tag/,
        /Chapter title/,
        /Words inside books.*Coming with books/,
      ]);
      for (const row of await list.getByRole("listitem").all()) {
        const icon = await boxOf(row.locator("[data-icon]"));
        expect(icon.x).toBe(16);
        expect(icon.width).toBe(24);
      }
      const words = await boxOf(
        list.getByText("Title or series", { exact: true }),
      );
      expect(words.x).toBe(56);
    });

    test("pads the section headings and the filter example 16px from both edges", async ({
      page,
    }) => {
      await page.goto("/search");

      for (const name of ["You can search for", "Type a filter to narrow"]) {
        const heading = await boxOf(page.getByRole("heading", { name }));
        expect(heading.x).toBe(16);
      }
      const example = page.getByText("For example,", { exact: false });
      expect((await boxOf(example)).x).toBe(16);
    });

    test("heads the chapter titles in the green accent and lists each under its series", async ({
      page,
    }) => {
      await openSearch(page);
      const heading = page.getByRole("heading", { name: "Chapter titles · 2" });

      await expect(heading).toBeVisible();
      await expect(heading).toHaveCSS("font-size", "14px");
      await expect(heading).toHaveCSS("font-weight", "500");
      await expect(
        page.getByRole("link", { name: /Harbour chapter 1/ }),
      ).toBeVisible();
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
            page
              .locator("li", { hasText: "Title or series" })
              .locator("[data-icon]"),
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

test.describe(
  "the library's search on an Android tablet",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's search");
    });
    test.use({ viewport: TABLET });

    test("lists no chapter titles, which only the Android phone and macOS search for", async ({
      page,
    }) => {
      await page.goto("/search");
      await page
        .getByRole("main")
        .getByRole("combobox", { name: "Search your library" })
        .fill("sample");

      await expect(
        page.getByText(CATALOG[0]?.title ?? "").first(),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /Chapter titles/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: /Harbour chapter 1/ }),
      ).toHaveCount(0);
    });
  },
);

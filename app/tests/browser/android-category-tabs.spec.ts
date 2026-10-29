import type { Locator, Page } from "@playwright/test";

import type { LibraryCategory } from "../../src/lib/ipc/bindings.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  settle,
  test,
  tokenColour,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(12);
const CATEGORIES = [
  { id: "manga", name: "Manga" },
  { id: "comics", name: "Comics" },
] as LibraryCategory[];
const MANY_CATEGORIES = [
  ...CATEGORIES,
  ...[
    "Plan to read",
    "Favourites",
    "Seinen",
    "Sea stories",
    "Shelved for later",
    "Borrowed from friends",
  ].map((name) => ({ id: name, name })),
] as LibraryCategory[];
const LABEL_SIZE = "14px";
const LABEL_LINE = "20px";
const LABEL_WEIGHT = "500";
const INDICATOR_HEIGHT = 3;
const TAB_INLINE_PADDING = 16;
const TAB_MIN_WIDTH = 80;
const TAB_HEIGHT = 48;
const SHEET_TITLE_SIZE = "22px";
const SHEET_TITLE_LINE = "28px";
const SHEET_TITLE_WEIGHT = "400";
const SHEET_INLINE_PADDING = 16;
const SHEET_BUTTON_HEIGHT = 40;
const SHEET_BUTTON_GAP = 8;
const SHEET_FOOT_TOP = 12;
const SHEET_FOOT_BOTTOM = 16;
const HANDLE_WIDTH = 32;
const HANDLE_HEIGHT = 4;
const HANDLE_GAP = 22;
const LAYOUT_ROUNDING_PX = 0.5;

function backendWith(categories: readonly LibraryCategory[]) {
  const inCategory = (category: string) =>
    category === "manga" ? LIBRARY.slice(0, 4) : [];
  return {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    libraryCategories: () => [...categories],
    categorySeries: (
      category: string,
      after: Parameters<ReturnType<typeof pagedSeries>>[0],
      listing: Parameters<ReturnType<typeof pagedSeries>>[1],
    ) => pagedSeries(() => inCategory(category))(after, listing),
    categorySeriesCount: (category: string) => inCategory(category).length,
  };
}

function tabs(page: Page) {
  return page.getByRole("tablist", { name: "Categories" });
}

function pseudoOf(locator: Locator, pseudo: "::after") {
  return locator.evaluate((element, which) => {
    const style = getComputedStyle(element, which);
    return {
      content: style.content,
      height: Number.parseFloat(style.height),
      width: Number.parseFloat(style.width),
      background: style.backgroundColor,
      corners: [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ],
    };
  }, pseudo);
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Series" })).toContainText(
    LIBRARY[0]?.title ?? "",
  );
}

async function openEveryCategory(page: Page): Promise<Locator> {
  await openLibrary(page);
  await page.getByRole("button", { name: "Every category" }).click();
  const sheet = page.getByRole("dialog", { name: "Categories" });
  await expect(sheet).toBeVisible();
  await settle(sheet);
  return sheet;
}

test.describe(
  "the library's category tabs on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's Material tabs");
    });

    test.describe("with more categories than fit", () => {
      test.use({ backend: backendWith(MANY_CATEGORIES) });

      test("sets each name as label medium, 14px on a 20px line at 500", async ({
        page,
      }) => {
        await openLibrary(page);

        for (const name of ["All", "Manga"]) {
          const tab = tabs(page).getByRole("tab", { name });
          await expect(tab).toHaveCSS("font-size", LABEL_SIZE);
          await expect(tab).toHaveCSS("line-height", LABEL_LINE);
          await expect(tab).toHaveCSS("font-weight", LABEL_WEIGHT);
        }
      });

      test("inks the current tab in the accent and the others muted", async ({
        page,
      }) => {
        await openLibrary(page);

        await expect(tabs(page).getByRole("tab", { name: "All" })).toHaveCSS(
          "color",
          await tokenColour(page, "--native-color-on-tab-current"),
        );
        await expect(tabs(page).getByRole("tab", { name: "Manga" })).toHaveCSS(
          "color",
          await tokenColour(page, "--native-color-on-tab"),
        );
      });

      test("underlines only the current tab, a 3px accent line rounded at its top that spans the name", async ({
        page,
      }) => {
        await openLibrary(page);
        const current = tabs(page).getByRole("tab", { name: "All" });
        const other = tabs(page).getByRole("tab", { name: "Manga" });

        const line = await pseudoOf(current, "::after");
        const none = await pseudoOf(other, "::after");

        expect(line.height).toBe(INDICATOR_HEIGHT);
        expect(line.width).toBeCloseTo(
          (await boxOf(current)).width - 2 * TAB_INLINE_PADDING,
          0,
        );
        expect(line.background).toBe(
          await tokenColour(page, "--native-color-on-tab-current"),
        );
        expect(line.corners).toEqual(["3px", "3px", "0px", "0px"]);
        expect(none.content).toBe("none");
      });

      test("moves the underline to the tab chosen", async ({ page }) => {
        await openLibrary(page);
        const manga = tabs(page).getByRole("tab", { name: "Manga" });

        await manga.click();

        await expect(manga).toHaveAttribute("aria-selected", "true");
        expect((await pseudoOf(manga, "::after")).height).toBe(
          INDICATOR_HEIGHT,
        );
        expect(
          (
            await pseudoOf(
              tabs(page).getByRole("tab", { name: "All" }),
              "::after",
            )
          ).content,
        ).toBe("none");
      });

      test("keeps every tab 80px wide at least and 48px tall, names only", async ({
        page,
      }) => {
        await openLibrary(page);

        const all = await boxOf(tabs(page).getByRole("tab", { name: "All" }));

        expect(all.width).toBeGreaterThanOrEqual(
          TAB_MIN_WIDTH - LAYOUT_ROUNDING_PX,
        );
        expect(all.height).toBeCloseTo(TAB_HEIGHT, 0);
        await expect(tabs(page).getByRole("tab")).toHaveCount(
          MANY_CATEGORIES.length + 1,
        );
      });

      test("cuts the row at its end, leaving the rest to scroll", async ({
        page,
      }) => {
        await openLibrary(page);

        const strip = await tabs(page).evaluate((element) => ({
          scrolls: element.scrollWidth > element.clientWidth,
          last: element.lastElementChild?.getBoundingClientRect().right ?? 0,
          edge: element.getBoundingClientRect().right,
        }));

        expect(strip.scrolls).toBe(true);
        expect(strip.last).toBeGreaterThan(strip.edge);
      });

      test("rules the row's foot with the separator colour, and mutes the arrow", async ({
        page,
      }) => {
        await openLibrary(page);

        const row = tabs(page).locator("xpath=..");
        const arrow = page.getByRole("button", { name: "Every category" });

        await expect(row).toHaveCSS(
          "border-bottom-color",
          await tokenColour(page, "--native-color-tab-rule"),
        );
        await expect(arrow).toHaveCSS(
          "color",
          await tokenColour(page, "--native-color-on-tab"),
        );
      });

      test("has no accessibility violations", async ({ page }) => {
        await openLibrary(page);

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    });

    test.describe("with one category", () => {
      test.use({ backend: backendWith(CATEGORIES.slice(0, 1)) });

      test("shows no tabs and no arrow", async ({ page }) => {
        await openLibrary(page);

        await expect(tabs(page)).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Every category" }),
        ).toHaveCount(0);
      });
    });

    test.describe("with an empty library", () => {
      test.use({
        backend: {
          ...backendWith(CATEGORIES),
          librarySeries: pagedSeries(() => []),
          librarySeriesCount: () => 0,
        },
      });

      test("shows no tabs", async ({ page }) => {
        await page.goto("/");
        await expect(
          page.getByRole("heading", { level: 1, name: "Library" }),
        ).toBeVisible();

        await expect(tabs(page)).toHaveCount(0);
      });
    });
  },
);

test.describe("every category on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android's modal bottom sheet");
  });

  test.use({ backend: backendWith(CATEGORIES) });

  test("sets a drag handle at the top, 32 by 4 with 22px above it", async ({
    page,
  }) => {
    const sheet = await openEveryCategory(page);

    const handle = await boxOf(
      sheet.locator('span[aria-hidden="true"]').first(),
    );
    const top = (await boxOf(sheet)).y;

    expect(handle.width).toBeCloseTo(HANDLE_WIDTH, 0);
    expect(handle.height).toBeCloseTo(HANDLE_HEIGHT, 0);
    expect(handle.y - top).toBeCloseTo(HANDLE_GAP, 0);
  });

  test("sets the title at title large with no badge before it", async ({
    page,
  }) => {
    const sheet = await openEveryCategory(page);
    const title = sheet.getByRole("heading", { name: "Categories" });

    await expect(title).toHaveCSS("font-size", SHEET_TITLE_SIZE);
    await expect(title).toHaveCSS("line-height", SHEET_TITLE_LINE);
    await expect(title).toHaveCSS("font-weight", SHEET_TITLE_WEIGHT);
    expect((await boxOf(title)).x - (await boxOf(sheet)).x).toBeCloseTo(
      SHEET_INLINE_PADDING,
      0,
    );
  });

  test("says what the sheet holds under the title in muted text", async ({
    page,
  }) => {
    const sheet = await openEveryCategory(page);
    const line = sheet.getByText("Every tab in your library.");

    await expect(line).toHaveCSS("font-size", LABEL_SIZE);
    await expect(line).toHaveCSS("line-height", LABEL_LINE);
    await expect(line).toHaveCSS(
      "color",
      await tokenColour(page, "--secondary-text"),
    );
  });

  test("tints the current category's row and ticks it, leaving the others plain", async ({
    page,
  }) => {
    const sheet = await openEveryCategory(page);
    const current = sheet.getByRole("radio", { name: "All" });
    const other = sheet.getByRole("radio", { name: "Manga" });

    await expect(current).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-row-current"),
    );
    await expect(current).toHaveCSS(
      "color",
      await tokenColour(page, "--native-color-on-row-current"),
    );
    await expect(current.locator('[data-icon="check"]')).toHaveCount(1);
    await expect(other).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(other.locator('[data-icon="check"]')).toHaveCount(0);
  });

  test("sets Edit and New category side by side at the foot, New category filled in the secondary colour", async ({
    page,
  }) => {
    const sheet = await openEveryCategory(page);
    const edit = sheet.getByRole("button", { name: "Edit" });
    const made = sheet.getByRole("button", { name: "New category" });

    const sheetBox = await boxOf(sheet);
    const editBox = await boxOf(edit);
    const madeBox = await boxOf(made);

    expect(editBox.y).toBeCloseTo(madeBox.y, 0);
    expect(editBox.height).toBeCloseTo(SHEET_BUTTON_HEIGHT, 0);
    expect(editBox.width).toBeCloseTo(madeBox.width, 0);
    expect(madeBox.x - (editBox.x + editBox.width)).toBeCloseTo(
      SHEET_BUTTON_GAP,
      0,
    );
    expect(editBox.x - sheetBox.x).toBeCloseTo(SHEET_INLINE_PADDING, 0);
    expect(
      sheetBox.y + sheetBox.height - (editBox.y + editBox.height),
    ).toBeCloseTo(SHEET_FOOT_BOTTOM, 0);
    await expect(made).toHaveCSS(
      "background-color",
      await tokenColour(page, "--native-color-button-secondary"),
    );
    await expect(edit).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test("sets 12px between the list and the buttons", async ({ page }) => {
    const sheet = await openEveryCategory(page);

    const rows = sheet.getByRole("radiogroup");
    const list = await boxOf(rows);
    const edit = await boxOf(sheet.getByRole("button", { name: "Edit" }));

    expect(edit.y - (list.y + list.height)).toBeCloseTo(SHEET_FOOT_TOP, 0);
  });

  test("chooses a category from its row and closes", async ({ page }) => {
    const sheet = await openEveryCategory(page);

    await sheet.getByRole("radio", { name: "Comics" }).click();

    await expect(sheet).toBeHidden();
    await expect(
      tabs(page).getByRole("tab", { name: "Comics" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openEveryCategory(page);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }
});

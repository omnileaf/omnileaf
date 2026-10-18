import type { Page } from "@playwright/test";

import type { LibraryCategory } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(12);
const MANGA = LIBRARY.slice(0, 4);
const COMICS = LIBRARY.slice(4, 6);
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
const NARROW_DESKTOP = 900;
const EDGE_TOLERANCE = 0.5;
const TAB_TEXT_SIZE = "14px";
const STRIP_INSET = 24;
const MORE_LABEL_INSET = 12;
const MORE_CHEVRON_GAP = 8;

function backendWith(categories: readonly LibraryCategory[]): FakeBackend {
  const inCategory = (category: string) =>
    ({ manga: MANGA, comics: COMICS })[category] ?? [];
  return {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    libraryCategories: () => [...categories],
    categorySeries: (category, after, listing) =>
      pagedSeries(() => inCategory(category))(after, listing),
    categorySeriesCount: (category) => inCategory(category).length,
  };
}

function tabs(page: Page) {
  return page.getByRole("tablist", { name: "Categories" });
}

function cutTabs(page: Page): Promise<string[]> {
  return tabs(page).evaluate((strip, tolerance) => {
    const bounds = strip.getBoundingClientRect();
    return [...strip.querySelectorAll<HTMLElement>("[role=tab]")]
      .filter((tab) => {
        const { left, right } = tab.getBoundingClientRect();
        const isDrawn = getComputedStyle(tab).visibility === "visible";
        const touchesStrip = right > bounds.left && left < bounds.right;
        const isWhole =
          left >= bounds.left - tolerance && right <= bounds.right + tolerance;
        return isDrawn && touchesStrip && !isWhole;
      })
      .map((tab) => tab.innerText);
  }, EDGE_TOLERANCE);
}

interface MoreSpacing {
  readonly labelInset: number;
  readonly chevronGap: number;
}

function moreSpacing(page: Page): Promise<MoreSpacing> {
  return page.getByRole("button", { name: "More" }).evaluate((button) => {
    const text = [...button.childNodes].find(
      (node): node is Text =>
        node instanceof Text && node.data.trim().length > 0,
    );
    const chevron = button.querySelector("svg");
    if (text === undefined || chevron === null) {
      throw new Error("More has no label or no chevron");
    }
    const words = text.data.trim();
    const start = text.data.indexOf(words);
    const label = document.createRange();
    label.setStart(text, start);
    label.setEnd(text, start + words.length);
    const labelBox = label.getBoundingClientRect();
    return {
      labelInset: labelBox.left - button.getBoundingClientRect().left,
      chevronGap: chevron.getBoundingClientRect().left - labelBox.right,
    };
  });
}

function seriesList(page: Page) {
  return page.getByRole("list", { name: "Series" });
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(seriesList(page)).toContainText(LIBRARY[0]?.title ?? "");
}

test.describe("with two categories", () => {
  test.use({ backend: backendWith(CATEGORIES) });

  test("puts a tab for each category after All, and lists only the chosen category's series", async ({
    page,
  }) => {
    await openLibrary(page);

    await expect(tabs(page).getByRole("tab")).toHaveText([
      "All",
      "Manga",
      "Comics",
    ]);
    await tabs(page).getByRole("tab", { name: "Comics" }).click();

    await expect(
      tabs(page).getByRole("tab", { name: "Comics" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(seriesList(page).getByRole("listitem")).toHaveCount(
      COMICS.length,
    );
  });

  test("opens on the tab chosen last time", async ({ page }) => {
    await openLibrary(page);
    await tabs(page).getByRole("tab", { name: "Manga" }).click();
    await expect(seriesList(page).getByRole("listitem")).toHaveCount(
      MANGA.length,
    );

    await page.reload();

    await expect(
      tabs(page).getByRole("tab", { name: "Manga" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(seriesList(page).getByRole("listitem")).toHaveCount(
      MANGA.length,
    );
  });

  test("moves between tabs with the arrow keys", async ({ page }) => {
    await openLibrary(page);
    await tabs(page).getByRole("tab", { name: "All" }).focus();

    await page.keyboard.press("ArrowRight");

    const manga = tabs(page).getByRole("tab", { name: "Manga" });
    await expect(manga).toBeFocused();
    await expect(manga).toHaveAttribute("aria-selected", "true");
  });

  test("lists every tab in a sheet from the chevron on phones", async ({
    page,
  }) => {
    await openLibrary(page);
    test.skip(
      viewportOf(page).width >= MEDIUM_MIN_WIDTH,
      "wider screens tuck the tabs into More",
    );

    await page.getByRole("button", { name: "Every category" }).click();
    const sheet = page.getByRole("dialog", { name: "Categories" });
    await sheet.getByRole("radio", { name: "Comics" }).click();

    await expect(sheet).toBeHidden();
    await expect(
      tabs(page).getByRole("tab", { name: "Comics" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test.describe("beside the desktop sidebar", () => {
    test.beforeEach(async ({ page }) => {
      await openLibrary(page);
      test.skip(
        viewportOf(page).width < EXPANDED_MIN_WIDTH,
        "the desktop sidebar opens from 840px",
      );
    });

    test("starts the tab strip 24px after the sidebar", async ({ page }) => {
      const sidebar = await boxOf(
        page.getByRole("navigation", { name: "Main" }),
      );
      const strip = await boxOf(tabs(page));

      expect(strip.x - (sidebar.x + sidebar.width)).toBe(STRIP_INSET);
    });

    test("sets More's label 12px inside the button", async ({ page }) => {
      const { labelInset } = await moreSpacing(page);

      expect(labelInset).toBeCloseTo(MORE_LABEL_INSET, 0);
    });

    test("puts More's chevron 8px after its label", async ({ page }) => {
      const { chevronGap } = await moreSpacing(page);

      expect(chevronGap).toBeCloseTo(MORE_CHEVRON_GAP, 0);
    });
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the tabs have no accessibility violations in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openLibrary(page);

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });
  }
});

test.describe("on Android", () => {
  test.use({
    backend: {
      ...backendWith(CATEGORIES),
      appInfo: onPlatform("android").backend.appInfo,
    },
  });

  test("sets the tab labels at 14px", async ({ page }) => {
    await openLibrary(page);

    await expect(tabs(page).getByRole("tab", { name: "Manga" })).toHaveCSS(
      "font-size",
      TAB_TEXT_SIZE,
    );
  });
});

test.describe("with one category", () => {
  test.use({ backend: backendWith(CATEGORIES.slice(0, 1)) });

  test("shows no tabs", async ({ page }) => {
    await openLibrary(page);

    await expect(tabs(page)).toHaveCount(0);
  });
});

test.describe("with more categories than fit", () => {
  test.use({ backend: backendWith(MANY_CATEGORIES) });

  test("tucks the tabs that don't fit into More on desktops", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "phones and tablets scroll their tabs");
    await page.setViewportSize({ width: NARROW_DESKTOP, height: 800 });
    await openLibrary(page);

    await page.getByRole("button", { name: "More" }).click();

    const menu = page.getByRole("menu");
    await expect(menu).toContainText("More categories");
    await expect(
      menu.getByRole("menuitemradio", { name: "Borrowed from friends" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitemradio", { name: "Manga" }),
    ).toHaveCount(0);
  });

  test.describe("on screens wide enough for More", () => {
    test.beforeEach(async ({ page }) => {
      test.skip(
        viewportOf(page).width < MEDIUM_MIN_WIDTH,
        "phones scroll their tabs",
      );
      await page.setViewportSize({ width: NARROW_DESKTOP, height: 800 });
      await openLibrary(page);
    });

    test("draws only whole tabs, leaving the rest to More", async ({
      page,
    }) => {
      await page.getByRole("button", { name: "More" }).click();
      await expect(
        page
          .getByRole("menu")
          .getByRole("menuitemradio", { name: "Sea stories" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");

      await expect.poll(() => cutTabs(page)).toEqual([]);
    });

    test("draws a tab chosen from More whole in the strip", async ({
      page,
    }) => {
      await page.getByRole("button", { name: "More" }).click();

      await page
        .getByRole("menu")
        .getByRole("menuitemradio", { name: "Borrowed from friends" })
        .click();

      await expect(
        tabs(page).getByRole("tab", { name: "Borrowed from friends" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect.poll(() => cutTabs(page)).toEqual([]);
    });

    test("arrows onto a tab tucked into More, drawing it whole", async ({
      page,
    }) => {
      const seinen = tabs(page).getByRole("tab", { name: "Seinen" });
      await seinen.click();
      await seinen.focus();

      await page.keyboard.press("ArrowRight");

      const seaStories = tabs(page).getByRole("tab", { name: "Sea stories" });
      await expect(seaStories).toBeFocused();
      await expect(seaStories).toHaveAttribute("aria-selected", "true");
      await expect.poll(() => cutTabs(page)).toEqual([]);
    });
  });
});

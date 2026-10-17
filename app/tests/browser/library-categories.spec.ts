import type { Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryCategory,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  MEDIUM_MIN_WIDTH,
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
const SWIPE_PX = 200;
const SWIPE_STEPS = 6;

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

function seriesList(page: Page) {
  return page.getByRole("list", { name: "Series" });
}

function viewOptionsSwitch(page: Page, name: string) {
  return page.getByRole("switch", { name });
}

async function openViewOptions(page: Page): Promise<void> {
  await page
    .getByRole("main")
    .getByRole("button", { name: "View options" })
    .click();
}

async function swipeCovers(
  page: Page,
  by: { x: number; y: number },
): Promise<void> {
  const list = seriesList(page);
  const box = await list.boundingBox();
  if (box === null) {
    throw new Error("the series list is not on screen");
  }
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 3 };
  const touch = { pointerType: "touch", pointerId: 7, isPrimary: true };
  await list.dispatchEvent("pointerdown", {
    ...touch,
    clientX: start.x,
    clientY: start.y,
  });
  for (let step = 1; step <= SWIPE_STEPS; step += 1) {
    const share = step / SWIPE_STEPS;
    await list.dispatchEvent("pointermove", {
      ...touch,
      clientX: start.x + by.x * share,
      clientY: start.y + by.y * share,
    });
  }
  await list.dispatchEvent("pointerup", {
    ...touch,
    clientX: start.x + by.x,
    clientY: start.y + by.y,
  });
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(seriesList(page)).toContainText(LIBRARY[0]?.title ?? "");
}

test.describe("with two categories", () => {
  test.use({ backend: backendWith(CATEGORIES) });

  test("swipes the covers to the next category's tab, and back", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.use.hasTouch !== true, "a finger swipes");
    await openLibrary(page);

    await swipeCovers(page, { x: -SWIPE_PX, y: 0 });
    await expect(
      tabs(page).getByRole("tab", { name: "Manga" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(seriesList(page).getByRole("listitem")).toHaveCount(
      MANGA.length,
    );
    await swipeCovers(page, { x: SWIPE_PX, y: 0 });

    await expect(tabs(page).getByRole("tab", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("keeps the tab on a drag up the covers", async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.hasTouch !== true, "a finger swipes");
    await openLibrary(page);

    await swipeCovers(page, { x: -SWIPE_PX / 2, y: -SWIPE_PX });

    await expect(tabs(page).getByRole("tab", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

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

test.describe("with Category tabs turned off in View options", () => {
  let storedView: LibraryView = DEFAULT_LIBRARY_VIEW;

  test.use({
    backend: {
      ...backendWith(CATEGORIES),
      libraryView: () => storedView,
      setLibraryView: (view) => {
        storedView = view;
        return null;
      },
    },
  });

  test.beforeEach(() => {
    storedView = DEFAULT_LIBRARY_VIEW;
  });

  test("hides the tabs and lists every series, and remembers it", async ({
    page,
  }) => {
    await openLibrary(page);
    await tabs(page).getByRole("tab", { name: "Comics" }).click();
    await expect(seriesList(page).getByRole("listitem")).toHaveCount(
      COMICS.length,
    );

    await openViewOptions(page);
    await viewOptionsSwitch(page, "Category tabs").click();

    await expect(tabs(page)).toHaveCount(0);
    await expect(seriesList(page).getByRole("listitem")).toHaveCount(
      LIBRARY.length,
    );
    await expect.poll(() => storedView.showsCategoryTabs).toBe(false);
  });
});

test.describe("with one category", () => {
  test.use({ backend: backendWith(CATEGORIES.slice(0, 1)) });

  test("shows no tabs", async ({ page }) => {
    await openLibrary(page);

    await expect(tabs(page)).toHaveCount(0);
  });

  test("offers no Category tabs switch in View options", async ({ page }) => {
    await openLibrary(page);
    await openViewOptions(page);
    await expect(viewOptionsSwitch(page, "Item counts")).toBeVisible();

    await expect(viewOptionsSwitch(page, "Category tabs")).toHaveCount(0);
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

  test("opens Library tabs from Edit categories under More", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "phones and tablets edit from the tab sheet");
    await page.setViewportSize({ width: NARROW_DESKTOP, height: 800 });
    await openLibrary(page);

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Edit categories" }).click();

    await expect(page).toHaveURL(/\/settings\/library\/tabs$/);
  });
});

test.describe("with the tabs arranged in Settings", () => {
  test.use({
    backend: {
      ...backendWith([
        ...CATEGORIES,
        { id: "plan", name: "Plan to read" },
      ] as LibraryCategory[]),
      libraryTabs: () => [
        { id: { kind: "category", id: "comics" }, isHidden: false },
        { id: { kind: "all" }, isHidden: false },
        { id: { kind: "newChapters" }, isHidden: false },
        { id: { kind: "category", id: "manga" }, isHidden: true },
      ],
    } satisfies FakeBackend,
  });

  test("puts the tabs in the order arranged, leaving the hidden ones off and new categories last", async ({
    page,
  }) => {
    await openLibrary(page);

    await expect(tabs(page).getByRole("tab")).toHaveText([
      "Comics",
      "All",
      "New chapters",
      "Plan to read",
    ]);
  });

  test("says no series match under New chapters, and goes back to All on clearing", async ({
    page,
  }) => {
    await openLibrary(page);

    await tabs(page).getByRole("tab", { name: "New chapters" }).click();
    await expect(
      page.getByRole("heading", { name: "No series match these filters" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear all filters" }).click();

    await expect(tabs(page).getByRole("tab", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

test.describe("opening on a chosen tab", () => {
  test.use({
    backend: {
      ...backendWith(CATEGORIES),
      libraryTabs: () => [
        { id: { kind: "all" }, isHidden: false },
        { id: { kind: "newChapters" }, isHidden: false },
        { id: { kind: "category", id: "manga" }, isHidden: false },
        { id: { kind: "category", id: "comics" }, isHidden: false },
      ],
    } satisfies FakeBackend,
  });

  function chosenTab(page: Page, name: string) {
    return expect(tabs(page).getByRole("tab", { name })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  }

  test("opens on the tab chosen in Library tabs, whichever was used last", async ({
    page,
  }) => {
    await page.goto("/settings/library/tabs");
    await page
      .getByRole("combobox", { name: "The library opens on" })
      .selectOption({ label: "Manga" });

    await openLibrary(page);
    await chosenTab(page, "Manga");
    await tabs(page).getByRole("tab", { name: "Comics" }).click();
    await page.reload();

    await chosenTab(page, "Manga");
  });

  test("keeps the tab used while the app stays open", async ({ page }) => {
    await page.goto("/settings/library/tabs");
    await page
      .getByRole("combobox", { name: "The library opens on" })
      .selectOption({ label: "All" });
    await openLibrary(page);
    await tabs(page).getByRole("tab", { name: "Comics" }).click();

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "History" })
      .click();
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Library" })
      .click();

    await chosenTab(page, "Comics");
  });

  test("opens on All rather than New chapters, where nothing is new", async ({
    page,
  }) => {
    await openLibrary(page);
    await tabs(page).getByRole("tab", { name: "New chapters" }).click();

    await page.reload();

    await chosenTab(page, "All");
  });
});

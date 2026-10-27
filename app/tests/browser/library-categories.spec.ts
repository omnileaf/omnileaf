import type { Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryCategory,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import { emitFakeEvent, type FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  fakeAppInfo,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  settle,
  targetOf,
  test,
  testOnlyInItsWebview,
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
const ANDROID_TOUCH_TARGET_PX = 48;
const LAYOUT_ROUNDING_PX = 0.25;
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

  test("keeps the category while picking series, however the covers are swiped", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.use.hasTouch !== true, "a finger swipes");
    await openLibrary(page);
    await page.getByRole("button", { name: "More for the library" }).click();
    await page.getByRole("menuitem", { name: "Select series" }).click();

    await swipeCovers(page, { x: -SWIPE_PX, y: 0 });

    await expect(seriesList(page).getByRole("listitem")).toHaveCount(
      LIBRARY.length,
    );
    await expect(seriesList(page)).toHaveCSS("translate", "none");
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
    test.skip(
      viewportOf(page).width >= MEDIUM_MIN_WIDTH,
      "wider screens tuck the tabs into More",
    );
    await openLibrary(page);

    await page.getByRole("button", { name: "Every category" }).click();
    const sheet = page.getByRole("dialog", { name: "Categories" });
    await expect(sheet).toBeVisible();
    await settle(sheet);
    await sheet.getByRole("radio", { name: "Comics" }).click();

    await expect(sheet).toBeHidden();
    await expect(
      tabs(page).getByRole("tab", { name: "Comics" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test.describe("beside the desktop sidebar", () => {
    test.beforeEach(async ({ page }) => {
      test.skip(
        viewportOf(page).width < EXPANDED_MIN_WIDTH,
        "the desktop sidebar opens from 840px",
      );
      await openLibrary(page);
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

  test.describe("on Android", () => {
    test.use({
      backend: {
        ...backendWith(CATEGORIES),
        appInfo: () => fakeAppInfo("android"),
      },
    });
    testOnlyInItsWebview("android");

    test("gives the All tab a 48 dp target while drawing it as narrow as its name", async ({
      page,
    }) => {
      test.skip(
        viewportOf(page).width >= EXPANDED_MIN_WIDTH,
        "expanded screens draw the tabs for the pointer",
      );
      await openLibrary(page);
      const all = tabs(page).getByRole("tab", { name: "All" });

      const target = await targetOf(all);

      expect(target.width).toBeGreaterThanOrEqual(
        ANDROID_TOUCH_TARGET_PX - LAYOUT_ROUNDING_PX,
      );
      expect(target.height).toBeGreaterThanOrEqual(
        ANDROID_TOUCH_TARGET_PX - LAYOUT_ROUNDING_PX,
      );
      expect((await boxOf(all)).width).toBeLessThan(ANDROID_TOUCH_TARGET_PX);
    });
  });
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

test.describe("every category on a phone", { tag: "@native" }, () => {
  const ROW_TITLE_SIZE = { ios: "17px", android: "16px" } as const;
  const RULE = {
    ios: { colour: "rgba(60, 60, 67, 0.12)", height: "1px" },
    android: { colour: "rgba(0, 0, 0, 0)", height: "0px" },
  } as const;
  const SHEET_BUTTON = { ios: 50, android: 40 } as const;

  test.use({ backend: backendWith(CATEGORIES) });

  async function openEveryCategory(page: Page) {
    await openLibrary(page);
    await page.getByRole("button", { name: "Every category" }).click();
    const sheet = page.getByRole("dialog", { name: "Categories" });
    await settle(sheet);
    return sheet;
  }

  test("lists the categories as the phone's own rows", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }

    const sheet = await openEveryCategory(page);
    const look = await sheet
      .getByRole("radio")
      .nth(1)
      .evaluate((row) => {
        const title = row.querySelector("[data-slot=item-title]") ?? row;
        return {
          titleSize: getComputedStyle(title).fontSize,
          rule: {
            colour: getComputedStyle(row, "::after").backgroundColor,
            height: getComputedStyle(row, "::after").height,
          },
        };
      });

    expect(look.titleSize).toBe(ROW_TITLE_SIZE[platform]);
    expect(look.rule).toEqual(RULE[platform]);
  });

  test("sets Edit and New category as the phone's own buttons", async ({
    page,
    platform,
  }) => {
    if (platform !== "ios" && platform !== "android") {
      test.skip();
      return;
    }

    const sheet = await openEveryCategory(page);
    const edit = await boxOf(sheet.getByRole("button", { name: "Edit" }));
    const made = await boxOf(
      sheet.getByRole("button", { name: "New category" }),
    );

    expect(edit.height).toBeCloseTo(SHEET_BUTTON[platform], 0);
    expect(made.height).toBeCloseTo(SHEET_BUTTON[platform], 0);
  });
});

test.describe("swiping through more categories than fit", () => {
  const FILLED = sampleSeries(3);

  test.use({
    backend: {
      ...backendWith(MANY_CATEGORIES),
      categorySeries: (_category, after, listing) =>
        pagedSeries(() => FILLED)(after, listing),
      categorySeriesCount: () => FILLED.length,
    },
  });

  test("brings the chosen tab into the strip as the covers are swiped", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.use.hasTouch !== true, "a finger swipes");
    await openLibrary(page);
    const last = MANY_CATEGORIES.at(-1)?.name ?? "";

    await swipeToLastCategory(page);

    await expect(tabs(page).getByRole("tab", { name: last })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect.poll(() => isWholeInStrip(page, last)).toBe(true);
  });

  test("holds the covers still on a drag past the first or last category", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.use.hasTouch !== true, "a finger swipes");
    await openLibrary(page);

    const atFirst = await draggedBy(page, SWIPE_PX);
    const towardsNext = await draggedBy(page, -SWIPE_PX);
    await swipeToLastCategory(page);
    const atLast = await draggedBy(page, -SWIPE_PX);

    expect(atFirst).toBe(0);
    expect(towardsNext).toBeLessThan(0);
    expect(atLast).toBe(0);
  });
});

async function draggedBy(page: Page, x: number): Promise<number> {
  const list = seriesList(page);
  const box = await boxOf(list);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 3 };
  const touch = { pointerType: "touch", pointerId: 9, isPrimary: true };
  await list.dispatchEvent("pointerdown", {
    ...touch,
    clientX: start.x,
    clientY: start.y,
  });
  await list.dispatchEvent("pointermove", {
    ...touch,
    clientX: start.x + x,
    clientY: start.y,
  });
  const moved = await list.evaluate(
    (element) => element.getBoundingClientRect().left,
  );
  await list.dispatchEvent("pointercancel", touch);
  return moved - box.x;
}

async function swipeToLastCategory(page: Page): Promise<void> {
  for (let swiped = 0; swiped < MANY_CATEGORIES.length; swiped += 1) {
    await swipeCovers(page, { x: -SWIPE_PX, y: 0 });
  }
}

test.describe("a category of one series", () => {
  const ONE = sampleSeries(1);

  test.use({
    backend: {
      ...backendWith(CATEGORIES),
      categorySeries: (_category, after, listing) =>
        pagedSeries(() => ONE)(after, listing),
      categorySeriesCount: () => ONE.length,
    },
  });

  test("swipes on from the empty screen below its cover", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.use.hasTouch !== true, "a finger swipes");
    await openLibrary(page);
    await swipeCovers(page, { x: -SWIPE_PX, y: 0 });
    await expect(seriesList(page).getByRole("listitem")).toHaveCount(1);

    await swipeBelowCovers(page, -SWIPE_PX);

    await expect(
      tabs(page).getByRole("tab", { name: "Comics" }),
    ).toHaveAttribute("aria-selected", "true");
  });
});

async function swipeBelowCovers(page: Page, x: number): Promise<void> {
  const list = await boxOf(seriesList(page));
  const screen = viewportOf(page);
  const start = {
    x: screen.width / 2,
    y: (list.y + list.height + screen.height) / 2,
  };
  await page.evaluate(
    ({ from, by, steps }) => {
      const target = document.elementFromPoint(from.x, from.y);
      if (target === null) {
        throw new Error("nothing is drawn below the covers");
      }
      const send = (type: string, moved: number) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerType: "touch",
            pointerId: 11,
            isPrimary: true,
            clientX: from.x + moved,
            clientY: from.y,
          }),
        );
      send("pointerdown", 0);
      for (let step = 1; step <= steps; step += 1) {
        send("pointermove", (by * step) / steps);
      }
      send("pointerup", by);
    },
    { from: start, by: x, steps: SWIPE_STEPS },
  );
}

async function isWholeInStrip(page: Page, name: string): Promise<boolean> {
  const strip = await boxOf(tabs(page));
  const tab = await boxOf(tabs(page).getByRole("tab", { name }));
  return (
    tab.x >= strip.x - EDGE_TOLERANCE &&
    tab.x + tab.width <= strip.x + strip.width + EDGE_TOLERANCE
  );
}

test.describe("more categories than fit, before the strip is first measured", () => {
  test.use({ backend: backendWith(MANY_CATEGORIES) });

  test.beforeEach(async ({ page }) => {
    test.skip(
      viewportOf(page).width < MEDIUM_MIN_WIDTH,
      "phones scroll their tabs",
    );
    await page.addInitScript(() => {
      window.IntersectionObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
        takeRecords(): IntersectionObserverEntry[] {
          return [];
        }
        readonly root = null;
        readonly rootMargin = "";
        readonly thresholds = [];
      } as unknown as typeof IntersectionObserver;
    });
  });

  test("draws no tab cut off at the strip's edge on screens wide enough for More", async ({
    page,
  }) => {
    await page.setViewportSize({ width: NARROW_DESKTOP, height: 800 });
    await openLibrary(page);

    expect(await cutTabs(page)).toEqual([]);
  });

  test("draws the tab it opens on whole, with no tab cut off, on screens wide enough for More", async ({
    page,
  }) => {
    await page.setViewportSize({ width: NARROW_DESKTOP, height: 800 });
    await page.goto("/settings/library/tabs");
    await page
      .getByRole("combobox", { name: "The library opens on" })
      .selectOption({ label: "Sea stories" });

    await page.goto("/");

    await expect(
      tabs(page).getByRole("tab", { name: "Sea stories" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(await isWholeInStrip(page, "Sea stories")).toBe(true);
    expect(await cutTabs(page)).toEqual([]);
  });

  test.describe("added while the library is open", () => {
    let keptCategories: readonly LibraryCategory[] = CATEGORIES;

    test.use({
      backend: {
        ...backendWith(MANY_CATEGORIES),
        libraryCategories: () => [...keptCategories],
      },
    });

    test.beforeEach(() => {
      keptCategories = CATEGORIES;
    });

    test("tucks the new tabs that don't fit into More at once", async ({
      page,
    }) => {
      await page.setViewportSize({ width: NARROW_DESKTOP, height: 800 });
      await openLibrary(page);
      const last = MANY_CATEGORIES.at(-1)?.name ?? "";

      keptCategories = MANY_CATEGORIES;
      await emitFakeEvent(page, "library-changed");
      await expect(
        tabs(page).getByRole("tab", { name: last, includeHidden: true }),
      ).toBeAttached();

      expect(await cutTabs(page)).toEqual([]);
      await page.getByRole("button", { name: "More" }).click();
      await expect(
        page.getByRole("menu").getByRole("menuitemradio", { name: last }),
      ).toBeVisible();
    });
  });
});

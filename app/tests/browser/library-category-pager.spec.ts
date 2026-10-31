import type { Locator, Page } from "@playwright/test";

import type { LibraryCategory, Platform } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const EVERY_SERIES = sampleSeries(12);
const MANGA = sampleSeries(5, 101);
const COMICS = sampleSeries(5, 201);
const LONG_ALL = sampleSeries(200);
const LONG_MANGA = sampleSeries(200, 1001);
const CATEGORIES = [
  { id: "manga", name: "Manga" },
  { id: "comics", name: "Comics" },
] as LibraryCategory[];
const PLATFORMS = ["android", "ios"] as const satisfies readonly Platform[];
const SWIPE_PX = 200;
const SHORT_DRAG_PX = 40;
const DRAG_STEPS = 6;
const HELD_MS = 400;
const SCROLLED_ALL_PX = 1500;
const SCROLLED_MANGA_PX = 600;
const SCROLLED_FAR_PX = 3000;
const SCROLL_TOLERANCE_PX = 2;

interface Library {
  readonly all: ReturnType<typeof sampleSeries>;
  readonly manga: ReturnType<typeof sampleSeries>;
  readonly comics: ReturnType<typeof sampleSeries>;
}

function backendWith(
  library: Library,
  platform: Platform,
  listed: string[] = [],
): FakeBackend {
  const inCategory = (category: string) =>
    ({ manga: library.manga, comics: library.comics })[category] ?? [];
  return {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo(platform),
    librarySeries: pagedSeries(() => library.all),
    librarySeriesCount: () => library.all.length,
    libraryCategories: () => [...CATEGORIES],
    categorySeries: (category, after, listing) => {
      listed.push(category);
      return pagedSeries(() => inCategory(category))(after, listing);
    },
    categorySeriesCount: (category) => inCategory(category).length,
  };
}

const SMALL: Library = { all: EVERY_SERIES, manga: MANGA, comics: COMICS };
const LONG: Library = { all: LONG_ALL, manga: LONG_MANGA, comics: COMICS };

function tabs(page: Page) {
  return page.getByRole("tablist", { name: "Categories" });
}

function chosenTab(page: Page, name: string) {
  return tabs(page).getByRole("tab", { name });
}

function seriesList(page: Page) {
  return page.getByRole("list", { name: "Series" });
}

function pageBeside(page: Page) {
  return page.locator('[data-pager-page="beside"]');
}

function pagerTrack(page: Page) {
  return page.locator("[data-pager-page]").first().locator("xpath=..");
}

function skipUnlessPhone(page: Page, hasTouch: boolean | undefined): void {
  test.skip(hasTouch !== true, "a finger swipes");
  test.skip(
    viewportOf(page).width >= MEDIUM_MIN_WIDTH,
    "only phones page between categories",
  );
}

interface Drag {
  readonly to: (x: number) => Promise<void>;
  readonly release: () => Promise<void>;
}

async function beginDrag(page: Page, from: Locator): Promise<Drag> {
  const box = await from.boundingBox();
  if (box === null) {
    throw new Error("the series list is not on screen");
  }
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 3 };
  const touch = { pointerType: "touch", pointerId: 7, isPrimary: true };
  let reached = 0;
  await from.dispatchEvent("pointerdown", {
    ...touch,
    clientX: start.x,
    clientY: start.y,
  });
  return {
    to: async (x) => {
      for (let step = 1; step <= DRAG_STEPS; step += 1) {
        reached = reached + (x - reached) / (DRAG_STEPS - step + 1);
        await from.dispatchEvent("pointermove", {
          ...touch,
          clientX: start.x + reached,
          clientY: start.y,
        });
      }
    },
    release: async () => {
      await from.dispatchEvent("pointerup", {
        ...touch,
        clientX: start.x + reached,
        clientY: start.y,
      });
    },
  };
}

async function scrolledBy(page: Page): Promise<number> {
  return page.getByRole("main").evaluate((main) => main.scrollTop);
}

async function scrollTo(page: Page, top: number): Promise<void> {
  await page.getByRole("main").evaluate((main, to) => {
    main.scrollTo({ top: to });
  }, top);
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(seriesList(page)).toBeVisible();
}

for (const platform of PLATFORMS) {
  test.describe(`paging between categories on ${platform}`, () => {
    test.use({ backend: backendWith(SMALL, platform) });

    test("draws the next category's covers beside the chosen one, following the finger", async ({
      page,
    }, testInfo) => {
      skipUnlessPhone(page, testInfo.project.use.hasTouch);
      await openLibrary(page);
      const track = await boxOf(pagerTrack(page));

      const drag = await beginDrag(page, seriesList(page));
      await drag.to(-SWIPE_PX / 2);
      const halfway = await boxOf(pageBeside(page));
      await drag.to(-SWIPE_PX);
      const further = await boxOf(pageBeside(page));
      await drag.release();

      expect(halfway.x).toBeCloseTo(track.x + track.width - SWIPE_PX / 2, 0);
      expect(further.x).toBeCloseTo(track.x + track.width - SWIPE_PX, 0);
      expect(further.width).toBeCloseTo(track.width, 0);
    });

    test("shows the covers of the category that follows while dragging", async ({
      page,
    }, testInfo) => {
      skipUnlessPhone(page, testInfo.project.use.hasTouch);
      await openLibrary(page);

      const drag = await beginDrag(page, seriesList(page));
      await drag.to(-SWIPE_PX);

      await expect(pageBeside(page)).toContainText(MANGA[0]?.title ?? "");
      await drag.release();
    });

    test("settles on the next category after a drag past a quarter of the width", async ({
      page,
    }, testInfo) => {
      skipUnlessPhone(page, testInfo.project.use.hasTouch);
      await openLibrary(page);

      const drag = await beginDrag(page, seriesList(page));
      await drag.to(-SWIPE_PX);
      await drag.release();

      await expect(chosenTab(page, "Manga")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(seriesList(page).getByRole("listitem")).toHaveCount(
        MANGA.length,
      );
      await expect(pagerTrack(page)).toHaveCSS("translate", "none");
    });

    test("snaps back to the chosen category after a short drag", async ({
      page,
    }, testInfo) => {
      skipUnlessPhone(page, testInfo.project.use.hasTouch);
      await openLibrary(page);

      const drag = await beginDrag(page, seriesList(page));
      await drag.to(-SHORT_DRAG_PX);
      await page.waitForTimeout(HELD_MS);
      await drag.release();

      await expect(pagerTrack(page)).toHaveCSS("translate", "none");
      await expect(chosenTab(page, "All")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(seriesList(page).getByRole("listitem")).toHaveCount(
        EVERY_SERIES.length,
      );
    });

    test("settles on the category before after a drag the other way", async ({
      page,
    }, testInfo) => {
      skipUnlessPhone(page, testInfo.project.use.hasTouch);
      await openLibrary(page);
      await chosenTab(page, "Manga").click();
      await expect(seriesList(page).getByRole("listitem")).toHaveCount(
        MANGA.length,
      );

      const drag = await beginDrag(page, seriesList(page));
      await drag.to(SWIPE_PX);
      await expect(pageBeside(page).first()).toContainText(
        EVERY_SERIES[0]?.title ?? "",
      );
      await drag.release();

      await expect(chosenTab(page, "All")).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    test("holds at the first category, with no page before it", async ({
      page,
    }, testInfo) => {
      skipUnlessPhone(page, testInfo.project.use.hasTouch);
      await openLibrary(page);

      const drag = await beginDrag(page, seriesList(page));
      await drag.to(SWIPE_PX);
      const held = await pagerTrack(page).evaluate(
        (track) => track.style.translate,
      );
      await drag.release();

      expect(held).toBe("");
      await expect(chosenTab(page, "All")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(pageBeside(page)).toHaveCount(1);
    });

    test("holds at the last category, with no page after it", async ({
      page,
    }, testInfo) => {
      skipUnlessPhone(page, testInfo.project.use.hasTouch);
      await openLibrary(page);
      await chosenTab(page, "Comics").click();
      await expect(seriesList(page).getByRole("listitem")).toHaveCount(
        COMICS.length,
      );

      const drag = await beginDrag(page, seriesList(page));
      await drag.to(-SWIPE_PX);
      const held = await pagerTrack(page).evaluate(
        (track) => track.style.translate,
      );
      await drag.release();

      expect(held).toBe("");
      await expect(chosenTab(page, "Comics")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(pageBeside(page)).toHaveCount(1);
    });

    test("settles without moving when the system asks for less motion", async ({
      page,
    }, testInfo) => {
      skipUnlessPhone(page, testInfo.project.use.hasTouch);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openLibrary(page);

      const drag = await beginDrag(page, seriesList(page));
      await drag.to(-SWIPE_PX);
      await drag.release();

      await expect(chosenTab(page, "Manga")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        await pagerTrack(page).evaluate(
          (track) => track.getAnimations().length,
        ),
      ).toBe(0);
    });

    test("still moves between categories with the tabs", async ({ page }) => {
      test.skip(
        viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "only phones page between categories",
      );
      await openLibrary(page);

      await chosenTab(page, "All").focus();
      await page.keyboard.press("ArrowRight");

      await expect(chosenTab(page, "Manga")).toBeFocused();
      await expect(seriesList(page).getByRole("listitem")).toHaveCount(
        MANGA.length,
      );
    });
  });
}

test.describe("loading the categories beside the chosen one", () => {
  const listed: string[] = [];

  test.use({ backend: backendWith(SMALL, "android", listed) });

  test.beforeEach(() => {
    listed.length = 0;
  });

  test("reads the next category's first page before it is swiped to, and the one before it too", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width >= MEDIUM_MIN_WIDTH,
      "only phones page between categories",
    );
    await openLibrary(page);
    await chosenTab(page, "Manga").click();
    await expect(seriesList(page).getByRole("listitem")).toHaveCount(
      MANGA.length,
    );

    await expect.poll(() => listed.includes("comics")).toBe(true);
  });

  test("reads only the chosen category on tablets and desktops", async ({
    page,
  }) => {
    test.skip(
      viewportOf(page).width < MEDIUM_MIN_WIDTH,
      "phones page between categories",
    );
    await openLibrary(page);
    await chosenTab(page, "Manga").click();
    await expect(seriesList(page).getByRole("listitem")).toHaveCount(
      MANGA.length,
    );

    expect(listed).toEqual(["manga"]);
    await expect(page.locator("[data-pager-page]")).toHaveCount(0);
  });
});

test.describe("each category's scroll position", () => {
  test.use({ backend: backendWith(LONG, "android") });

  test("is kept when swiping away to another category and back", async ({
    page,
  }, testInfo) => {
    skipUnlessPhone(page, testInfo.project.use.hasTouch);
    await openLibrary(page);
    await scrollTo(page, SCROLLED_ALL_PX);
    await expect
      .poll(() => scrolledBy(page))
      .toBeGreaterThan(SCROLLED_MANGA_PX);
    const leftAll = await scrolledBy(page);

    const away = await beginDrag(page, seriesList(page));
    await away.to(-SWIPE_PX);
    await away.release();
    await expect(chosenTab(page, "Manga")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect.poll(() => scrolledBy(page)).toBe(0);
    await scrollTo(page, SCROLLED_MANGA_PX);
    await expect.poll(() => scrolledBy(page)).toBeGreaterThan(0);
    const leftManga = await scrolledBy(page);
    const back = await beginDrag(page, seriesList(page));
    await back.to(SWIPE_PX);
    await back.release();

    await expect(chosenTab(page, "All")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect
      .poll(() => scrolledBy(page))
      .toBeGreaterThan(leftAll - SCROLL_TOLERANCE_PX);
    expect(await scrolledBy(page)).toBeLessThan(leftAll + SCROLL_TOLERANCE_PX);
    const again = await beginDrag(page, seriesList(page));
    await again.to(-SWIPE_PX);
    await again.release();
    await expect(chosenTab(page, "Manga")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect
      .poll(() => scrolledBy(page))
      .toBeGreaterThan(leftManga - SCROLL_TOLERANCE_PX);
    expect(await scrolledBy(page)).toBeLessThan(
      leftManga + SCROLL_TOLERANCE_PX,
    );
  });

  test("shows a category's covers from where it was left while it comes into view", async ({
    page,
  }, testInfo) => {
    skipUnlessPhone(page, testInfo.project.use.hasTouch);
    await openLibrary(page);
    await chosenTab(page, "Manga").click();
    await expect(chosenTab(page, "Manga")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await scrollTo(page, SCROLLED_FAR_PX);
    await expect.poll(() => scrolledBy(page)).toBeGreaterThan(SCROLLED_ALL_PX);
    const leaving = await beginDrag(page, seriesList(page));
    await leaving.to(SWIPE_PX);
    await leaving.release();
    await expect(chosenTab(page, "All")).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const drag = await beginDrag(page, seriesList(page));
    await drag.to(-SWIPE_PX);

    const rowsDrawn = await pageBeside(page)
      .getByRole("listitem", { includeHidden: true })
      .first()
      .getAttribute("aria-posinset");
    await drag.release();

    expect(Number(rowsDrawn)).toBeGreaterThan(1);
  });
});

test.describe("on tablets and desktops", () => {
  test.use({ backend: backendWith(SMALL, "android") });

  test("keeps the covers of the chosen category only, and the swipe as it was", async ({
    page,
  }, testInfo) => {
    test.skip(
      viewportOf(page).width < MEDIUM_MIN_WIDTH,
      "phones page between categories",
    );
    await openLibrary(page);

    await expect(page.locator("[data-pager-page]")).toHaveCount(0);
    if (testInfo.project.use.hasTouch === true) {
      const drag = await beginDrag(page, seriesList(page));
      await drag.to(-SWIPE_PX);
      await drag.release();
      await expect(chosenTab(page, "Manga")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(seriesList(page).getByRole("listitem")).toHaveCount(
        MANGA.length,
      );
    }
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in the ${colorScheme} theme`, () => {
    test.use({ backend: backendWith(SMALL, "android") });

    test("has no accessibility violations with the pages at rest", async ({
      page,
    }, testInfo) => {
      skipUnlessPhone(page, testInfo.project.use.hasTouch);
      await page.emulateMedia({ colorScheme });
      await openLibrary(page);
      await expect(pageBeside(page)).toHaveCount(1);

      const violations = await accessibilityViolations(page);

      expect(violations).toEqual([]);
    });

    test("has no accessibility violations while the next category is dragged into view", async ({
      page,
    }, testInfo) => {
      skipUnlessPhone(page, testInfo.project.use.hasTouch);
      await page.emulateMedia({ colorScheme });
      await openLibrary(page);

      const drag = await beginDrag(page, seriesList(page));
      await drag.to(-SWIPE_PX);
      const violations = await accessibilityViolations(page);
      await drag.release();

      expect(violations).toEqual([]);
    });
  });
}

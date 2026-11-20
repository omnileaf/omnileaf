import type { ElementHandle, Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryCategory,
  type LibraryListing,
  type LibraryTab,
  type Platform,
} from "../../src/lib/ipc/bindings.ts";
import { NEW_LIBRARY_LISTING } from "../../src/lib/library/library-listing.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  lengthOf,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import { entry } from "./history-entries.ts";
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
const BLANK_INSET_PX = 8;
const SAME_ROW_PX = 1;

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
const EMPTY_COMICS: Library = { all: EVERY_SERIES, manga: MANGA, comics: [] };
const NEW_CHAPTERS_SHOWN: readonly LibraryTab[] = [
  { id: { kind: "all" }, isHidden: false },
  { id: { kind: "newChapters" }, isHidden: false },
];
const UNFINISHED = Array.from({ length: 5 }, (_, index) =>
  entry(index + 1, "2026-10-08T20:00:00Z", {
    state: "page",
    page: 10,
    pageCount: 40,
  }),
);
const UNREAD_ONLY: LibraryListing = {
  ...NEW_LIBRARY_LISTING,
  filter: { ...NEW_LIBRARY_LISTING.filter, unread: "only" },
};

function tabs(page: Page) {
  return page.getByRole("tablist", { name: "Categories" });
}

function chosenTab(page: Page, name: string) {
  return tabs(page).getByRole("tab", { name });
}

async function expectChosen(page: Page, name: string): Promise<void> {
  await expect(chosenTab(page, name)).toHaveAttribute("aria-selected", "true");
}

async function openEmptyTab(page: Page, name: string): Promise<void> {
  await openLibrary(page);
  await chosenTab(page, name).click();
  await expect(noMatches(page)).toBeVisible();
}

function seriesList(page: Page) {
  return page.getByRole("list", { name: "Series" });
}

function continueRow(page: Page) {
  return page.getByRole("region", { name: "Continue reading" });
}

function noMatches(page: Page) {
  return page.getByRole("region", { name: "No series match these filters" });
}

function pageBeside(page: Page) {
  return page.locator('[data-pager-page="beside"]');
}

function besideCovers(page: Page, firstTitle: string) {
  return pageBeside(page)
    .filter({ hasText: firstTitle })
    .getByRole("listitem", { includeHidden: true });
}

function chosenCovers(page: Page) {
  return seriesList(page).getByRole("listitem");
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

interface RowSpan {
  readonly start: number;
  readonly end: number;
}

async function firstRowOf(covers: Locator): Promise<RowSpan> {
  const boxes = await covers.evaluateAll((items) =>
    items.map((item) => {
      const { left, right, top } = item.getBoundingClientRect();
      return { left, right, top };
    }),
  );
  const first = boxes[0];
  if (first === undefined) {
    throw new Error("no covers are drawn");
  }
  const row = boxes.filter(
    ({ top }) => Math.abs(top - first.top) < SAME_ROW_PX,
  );
  return {
    start: Math.min(...row.map(({ left }) => left)),
    end: Math.max(...row.map(({ right }) => right)),
  };
}

interface Drag {
  readonly to: (x: number) => Promise<void>;
  readonly release: () => Promise<void>;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

type DragTarget = Pick<ElementHandle, "dispatchEvent">;

interface Spot {
  readonly target: ElementHandle<Element>;
  readonly at: Point;
}

async function beginDrag(page: Page, from: Locator): Promise<Drag> {
  const box = await from.boundingBox();
  if (box === null) {
    throw new Error("the dragged element is not on screen");
  }
  return beginDragAt(from, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 3,
  });
}

async function spotAt(page: Page, at: Point): Promise<Spot> {
  const target = (
    await page.evaluateHandle(({ x, y }) => document.elementFromPoint(x, y), at)
  ).asElement();
  if (target === null) {
    throw new Error("nothing is drawn at the spot");
  }
  return { target, at };
}

async function spotInside(page: Page, from: Locator): Promise<Spot> {
  const box = await boxOf(from);
  return spotAt(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

async function blankBelow(page: Page, emptyState: Locator): Promise<Spot> {
  const drawnEnd = await emptyState.evaluate((state) =>
    Math.max(
      ...[...state.children].map((part) => part.getBoundingClientRect().bottom),
    ),
  );
  const at = await page.getByRole("main").evaluate((main, inset) => {
    const box = main.getBoundingClientRect();
    const contentEnd =
      Math.min(box.bottom, window.innerHeight) -
      parseFloat(getComputedStyle(main).paddingBlockEnd);
    return { x: box.x + box.width / 2, y: contentEnd - inset };
  }, BLANK_INSET_PX);
  if (at.y <= drawnEnd) {
    throw new Error("the empty state leaves no blank space below it");
  }
  return spotAt(page, at);
}

async function beginDragAt(from: DragTarget, start: Point): Promise<Drag> {
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

for (const platform of PLATFORMS) {
  test.describe(`scrolling the Continue reading row on ${platform}`, () => {
    test.use({
      backend: {
        ...backendWith(SMALL, platform),
        libraryView: () => ({
          ...DEFAULT_LIBRARY_VIEW,
          showsContinueRow: true,
        }),
        readingHistory: (_after, of) => ({
          entries: of.kind === "unfinished" ? [...UNFINISHED] : [],
          next: null,
        }),
      },
    });

    test("keeps a sideways drag on the row for the row, not the tabs", async ({
      page,
    }, testInfo) => {
      skipUnlessPhone(page, testInfo.project.use.hasTouch);
      await openLibrary(page);
      const cards = continueRow(page).getByRole("list");
      await expect(cards.getByRole("listitem")).toHaveCount(UNFINISHED.length);
      expect(
        await cards.evaluate((row) => row.scrollWidth > row.clientWidth),
      ).toBe(true);
      const onCard = await spotInside(
        page,
        cards.getByRole("listitem").first(),
      );

      const drag = await beginDragAt(onCard.target, onCard.at);
      await drag.to(-SWIPE_PX);
      const swiping = await page.locator("[data-swiping]").count();
      const moved = await pagerTrack(page).evaluate(
        (track) => getComputedStyle(track).translate,
      );
      await drag.release();

      expect(swiping).toBe(0);
      expect(moved).toBe("none");
      await expect
        .poll(() =>
          pagerTrack(page).evaluate((track) => track.getAnimations().length),
        )
        .toBe(0);
      await expectChosen(page, "All");
    });
  });

  test.describe(`swiping from a tab that lists nothing on ${platform}`, () => {
    test.use({
      backend: {
        ...backendWith(EMPTY_COMICS, platform),
        libraryTabs: () => [...NEW_CHAPTERS_SHOWN],
      },
    });
    test.skip(({ hasTouch }) => !hasTouch, "a finger swipes");

    for (const { way, by, lands } of [
      { way: "after", by: -SWIPE_PX, lands: "Manga" },
      { way: "before", by: SWIPE_PX, lands: "All" },
    ]) {
      test(`moves from New chapters with nothing new to the tab ${way} it`, async ({
        page,
      }) => {
        await openEmptyTab(page, "New chapters");
        const blank = await blankBelow(page, noMatches(page));

        const drag = await beginDragAt(blank.target, blank.at);
        await drag.to(by);
        await drag.release();

        await expectChosen(page, lands);
      });
    }

    test("leaves the empty tab in place under the finger", async ({ page }) => {
      await openEmptyTab(page, "New chapters");
      const before = await boxOf(noMatches(page));

      const drag = await beginDrag(page, noMatches(page));
      await drag.to(-SWIPE_PX);
      const during = await boxOf(noMatches(page));
      const swiping = await page.locator("[data-swiping]").count();
      await drag.release();

      expect(during.x).toBe(before.x);
      expect(swiping).toBe(0);
    });

    test("keeps sideways drags on an empty tab for the swipe", async ({
      page,
    }) => {
      await openEmptyTab(page, "New chapters");
      const blank = await blankBelow(page, noMatches(page));

      const touchActions = await blank.target.evaluate((spot) => {
        const actions: string[] = [];
        for (
          let element: Element | null = spot;
          element !== null && element.tagName !== "MAIN";
          element = element.parentElement
        ) {
          actions.push(getComputedStyle(element).touchAction);
        }
        return actions.filter((action) => action !== "auto");
      });

      expect(touchActions).toEqual(["pan-y"]);
    });

    test("moves from an empty category to the tab before it", async ({
      page,
    }) => {
      await openEmptyTab(page, "Comics");
      const blank = await blankBelow(page, noMatches(page));

      const drag = await beginDragAt(blank.target, blank.at);
      await drag.to(SWIPE_PX);
      await drag.release();

      await expectChosen(page, "Manga");
    });

    test("moves from the covers onto New chapters with nothing new", async ({
      page,
    }) => {
      await openLibrary(page);
      await chosenTab(page, "Manga").click();
      await expect(seriesList(page).getByRole("listitem")).toHaveCount(
        MANGA.length,
      );

      const drag = await beginDrag(page, seriesList(page));
      await drag.to(SWIPE_PX);
      await drag.release();

      await expectChosen(page, "New chapters");
      await expect(noMatches(page)).toBeVisible();
    });
  });

  test.describe(`swiping from All filtered to no matches on ${platform}`, () => {
    test.use({
      backend: {
        ...backendWith(SMALL, platform),
        libraryListing: () => UNREAD_ONLY,
        librarySeries: (after, listing) =>
          listing.filter.unread === "only"
            ? { series: [], next: null }
            : pagedSeries(() => EVERY_SERIES)(after, listing),
      },
    });
    test.skip(({ hasTouch }) => !hasTouch, "a finger swipes");

    test("moves to the tab after it", async ({ page }) => {
      await page.goto("/");
      await expect(noMatches(page)).toBeVisible();
      const blank = await blankBelow(page, noMatches(page));

      const drag = await beginDragAt(blank.target, blank.at);
      await drag.to(-SWIPE_PX);
      await drag.release();

      await expectChosen(page, "Manga");
    });
  });
}

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

  test("moves the chosen category's covers with the finger on tablets", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.use.hasTouch !== true, "a finger swipes");
    test.skip(
      viewportOf(page).width < MEDIUM_MIN_WIDTH,
      "phones page between categories",
    );
    await openLibrary(page);
    const atRest = await firstRowOf(chosenCovers(page));

    const drag = await beginDrag(page, seriesList(page));
    await drag.to(-SWIPE_PX);
    const swiping = await firstRowOf(chosenCovers(page));
    await drag.release();

    expect(swiping.start).toBeCloseTo(atRest.start - SWIPE_PX, 0);
    expect(swiping.end).toBeCloseTo(atRest.end - SWIPE_PX, 0);
  });
});

test.describe("each category as a page of its own", { tag: "@native" }, () => {
  test.use({ backend: backendWith(SMALL, "android") });

  test("sits the covers one gutter in from each side of the column at rest", async ({
    page,
  }) => {
    await openLibrary(page);
    await expect(chosenCovers(page)).toHaveCount(EVERY_SERIES.length);
    const column = await boxOf(page.getByRole("main"));
    const gutter = await lengthOf(page, "--spacing-gutter");

    const covers = await firstRowOf(chosenCovers(page));

    expect(covers.start).toBeCloseTo(column.x + gutter, 0);
    expect(covers.end).toBeCloseTo(column.x + column.width - gutter, 0);
  });

  for (const { way, from, listed, by, incoming } of [
    {
      way: "after",
      from: "All",
      listed: EVERY_SERIES,
      by: -SWIPE_PX,
      incoming: MANGA,
    },
    {
      way: "before",
      from: "Manga",
      listed: MANGA,
      by: SWIPE_PX,
      incoming: EVERY_SERIES,
    },
  ]) {
    test(`keeps both pages' side padding with a gap between them while the category ${way} comes in`, async ({
      page,
    }, testInfo) => {
      skipUnlessPhone(page, testInfo.project.use.hasTouch);
      await openLibrary(page);
      await chosenTab(page, from).click();
      await expect(chosenTab(page, from)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(chosenCovers(page)).toHaveCount(listed.length);
      const incomingTitle = incoming[0]?.title ?? "";
      const column = await boxOf(page.getByRole("main"));
      const gap = await lengthOf(page, "--spacing-pager-gap");
      const atRest = await firstRowOf(chosenCovers(page));
      const startInset = atRest.start - column.x;
      const endInset = column.x + column.width - atRest.end;

      const drag = await beginDrag(page, seriesList(page));
      await drag.to(by);
      await expect(
        pageBeside(page).filter({ hasText: incomingTitle }),
      ).toHaveCount(1);
      await expect(besideCovers(page, incomingTitle)).toHaveCount(
        incoming.length,
      );
      const chosen = await firstRowOf(chosenCovers(page));
      const beside = await firstRowOf(besideCovers(page, incomingTitle));
      await drag.release();

      const [leading, trailing] = by < 0 ? [chosen, beside] : [beside, chosen];
      expect(chosen.start).toBeCloseTo(atRest.start + by, 0);
      expect(chosen.end).toBeCloseTo(atRest.end + by, 0);
      expect(
        trailing.start - startInset - (leading.end + endInset),
      ).toBeCloseTo(gap, 0);
    });
  }
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

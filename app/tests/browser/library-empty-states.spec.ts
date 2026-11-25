import type { Locator, Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import type {
  LibraryFilter,
  LibraryListing,
} from "../../src/lib/ipc/bindings.ts";
import {
  filtersOn,
  NEW_LIBRARY_LISTING,
} from "../../src/lib/library/library-listing.ts";
import { LIBRARY_TAB_KEY } from "../../src/lib/library/library-tab.svelte.ts";
import {
  CommandFailure,
  commandsAsked,
  emitFakeEvent,
  type FakeBackend,
} from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import {
  emptyCategory,
  MANGA_AND_TEST,
  noMatches,
  nothingNew,
  UNREAD_ONLY,
} from "./library-empty.ts";
import { openSortAndFilter } from "./library-controls.ts";
import {
  pagedSeries,
  sampleSeries,
  type WireSeries,
} from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
const MANGA = LIBRARY.slice(0, 3);

const ADD_SERIES = english.library_add_series;

let storedListing: LibraryListing = NEW_LIBRARY_LISTING;

function letThrough(
  series: readonly WireSeries[],
  filter: LibraryFilter,
): readonly WireSeries[] {
  return filtersOn(filter) === 0 ? series : [];
}

function backendHolding(library: readonly WireSeries[]): FakeBackend {
  const inCategory = (category: string) =>
    category === "manga" ? MANGA.filter((one) => library.includes(one)) : [];
  return {
    ...DEFAULT_BACKEND,
    librarySeries: (after, listing) =>
      pagedSeries(() => letThrough(library, listing.filter))(after, listing),
    librarySeriesCount: (filter) => letThrough(library, filter).length,
    libraryCategories: () => [...MANGA_AND_TEST],
    libraryTabs: () => [
      { id: { kind: "all" }, isHidden: false },
      { id: { kind: "newChapters" }, isHidden: false },
      { id: { kind: "category", id: "manga" }, isHidden: false },
      { id: { kind: "category", id: "test" }, isHidden: false },
    ],
    categorySeries: (category, after, listing) =>
      pagedSeries(() => letThrough(inCategory(category), listing.filter))(
        after,
        listing,
      ),
    categorySeriesCount: (category, filter) =>
      letThrough(inCategory(category), filter).length,
    libraryListing: () => storedListing,
    setLibraryListing: (listing) => {
      storedListing = listing;
      return null;
    },
  };
}

function tabs(page: Page) {
  return page.getByRole("tablist", { name: "Categories" });
}

function libraryHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: english.library_title });
}

async function waitForAnswers(page: Page): Promise<void> {
  await waitForAnswersBut(page, 0);
}

async function waitForAnswersBut(page: Page, held: number): Promise<void> {
  await expect
    .poll(async () => (await commandsAsked(page)).unanswered)
    .toBe(held);
}

async function openOnStoredTab(page: Page, tab: string): Promise<void> {
  await page.addInitScript(
    ([key, chosen]) => {
      localStorage.setItem(key, chosen);
    },
    [LIBRARY_TAB_KEY, tab] as const,
  );
  await page.goto("/");
}

async function noteEveryLibraryEmptyShown(page: Page): Promise<void> {
  await page.addInitScript((title) => {
    const shown: string[] = [];
    Object.assign(window, { libraryEmptyShown: shown });
    new MutationObserver(() => {
      if (document.querySelector("main")?.innerText.includes(title) === true) {
        shown.push(title);
      }
    }).observe(document, { subtree: true, childList: true });
  }, english.library_empty);
}

function libraryEmptyShown(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as Window & { libraryEmptyShown?: string[] }).libraryEmptyShown
        ?.length ?? 0,
  );
}

async function chooseUnreadOnly(page: Page): Promise<void> {
  const segment = page.getByRole("radio", { name: "Unread", exact: true });
  const readState = page.getByRole("combobox", { name: "Read state" });
  await expect(segment.or(readState)).toBeVisible();
  if (await readState.isVisible()) {
    await readState.selectOption({ label: "Unread" });
  } else {
    await segment.click();
  }
}

async function openOn(page: Page, tab: string): Promise<void> {
  await page.goto("/");
  await tabs(page).getByRole("tab", { name: tab }).click();
  await expect(tabs(page).getByRole("tab", { name: tab })).toHaveAttribute(
    "aria-selected",
    "true",
  );
}

test.beforeEach(() => {
  storedListing = NEW_LIBRARY_LISTING;
});

test.describe("the library's empty states", { tag: "@native" }, () => {
  test.describe("with an empty library", () => {
    test.use({ backend: backendHolding([]) });

    test("says the library is empty, not that filters leave nothing, while a filter is on", async ({
      page,
    }) => {
      storedListing = UNREAD_ONLY;

      await page.goto("/");

      await expect(
        page.getByRole("region", { name: english.library_empty }),
      ).toBeVisible();
      await expect(noMatches(page)).toHaveCount(0);
    });
  });

  test.describe("with series in the library", () => {
    test.use({ backend: backendHolding(LIBRARY) });

    test("says an empty category has nothing in it yet and how to fill it", async ({
      page,
    }) => {
      await openOn(page, "Test");

      await expect(emptyCategory(page, "Test")).toContainText(
        english.library_category_empty_body,
      );
      await expect(noMatches(page)).toHaveCount(0);
    });

    test("starts selecting on All from an empty category's Add series", async ({
      page,
    }) => {
      await openOn(page, "Test");

      await emptyCategory(page, "Test")
        .getByRole("button", { name: ADD_SERIES })
        .click();

      await expect(
        page.getByRole("list", { name: "Series" }).getByRole("checkbox"),
      ).toHaveCount(LIBRARY.length);
    });

    test("says an empty category has nothing in it yet while a filter is on, since clearing it would show nothing either", async ({
      page,
    }) => {
      storedListing = UNREAD_ONLY;

      await openOn(page, "Test");

      await expect(emptyCategory(page, "Test")).toBeVisible();
      await expect(noMatches(page)).toHaveCount(0);
    });

    test("says nothing is new under New chapters", async ({ page }) => {
      await openOn(page, "New chapters");

      await expect(nothingNew(page)).toContainText(
        english.library_new_chapters_empty_body,
      );
      await expect(noMatches(page)).toHaveCount(0);
    });

    test("offers no action under New chapters, since nothing can be added there", async ({
      page,
    }) => {
      await openOn(page, "New chapters");

      await expect(nothingNew(page)).toBeVisible();

      await expect(nothingNew(page).getByRole("button")).toHaveCount(0);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`an empty category has no accessibility violations in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await openOn(page, "Test");
        await expect(emptyCategory(page, "Test")).toBeVisible();

        const violations = await accessibilityViolations(page);

        expect(violations).toEqual([]);
      });
    }

    test("starts selecting on All without saying on the way that the library is empty", async ({
      page,
    }) => {
      await noteEveryLibraryEmptyShown(page);
      await openOn(page, "Test");

      await emptyCategory(page, "Test")
        .getByRole("button", { name: ADD_SERIES })
        .click();
      await expect(
        page.getByRole("list", { name: "Series" }).getByRole("listitem"),
      ).toHaveCount(LIBRARY.length);

      expect(await libraryEmptyShown(page)).toBe(0);
    });

    test("puts focus on the library's heading once Add series takes the empty category away", async ({
      page,
    }) => {
      await openOn(page, "Test");
      await emptyCategory(page, "Test")
        .getByRole("button", { name: ADD_SERIES })
        .focus();

      await page.keyboard.press("Enter");

      await expect(libraryHeading(page)).toBeFocused();
    });

    test("puts focus on the library's heading once the filters' empty state takes the empty category's place", async ({
      page,
    }) => {
      storedListing = UNREAD_ONLY;
      await openOn(page, "Test");
      await emptyCategory(page, "Test")
        .getByRole("button", { name: ADD_SERIES })
        .focus();

      await page.keyboard.press("Enter");

      await expect(noMatches(page)).toBeVisible();
      await expect(libraryHeading(page)).toBeFocused();
    });

    test("puts focus on the library's heading once clearing the filters takes their empty state away", async ({
      page,
    }) => {
      storedListing = UNREAD_ONLY;
      await openOn(page, "Manga");
      await noMatches(page)
        .getByRole("button", { name: english.library_clear_all_filters })
        .focus();

      await page.keyboard.press("Enter");

      await expect(libraryHeading(page)).toBeFocused();
    });

    test("keeps Add series and the focus on it through a library change on an empty category under a filter", async ({
      page,
    }) => {
      storedListing = UNREAD_ONLY;
      await openOn(page, "Test");
      const addSeries = emptyCategory(page, "Test").getByRole("button", {
        name: ADD_SERIES,
      });
      await addSeries.focus();

      await emitFakeEvent(page, "library-changed");
      await waitForAnswers(page);

      await expect(addSeries).toBeFocused();
      await expect(noMatches(page)).toHaveCount(0);
    });

    test("says no series match when filters leave nothing in a category, and stays on it when they're cleared", async ({
      page,
    }) => {
      storedListing = UNREAD_ONLY;
      await openOn(page, "Manga");

      await noMatches(page)
        .getByRole("button", { name: english.library_clear_all_filters })
        .click();

      await expect(
        tabs(page).getByRole("tab", { name: "Manga" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("list", { name: "Series" }).getByRole("listitem"),
      ).toHaveCount(MANGA.length);
      await expect.poll(() => storedListing).toEqual(NEW_LIBRARY_LISTING);
    });
  });
});

test.describe(
  "moving between tabs that list nothing under a filter",
  { tag: "@native" },
  () => {
    test.use({ backend: backendHolding(LIBRARY) });

    test.beforeEach(() => {
      storedListing = UNREAD_ONLY;
    });

    test("says no series match on a category the filter empties, after New chapters with nothing new", async ({
      page,
    }) => {
      await openOn(page, "New chapters");
      await expect(nothingNew(page)).toBeVisible();

      await tabs(page).getByRole("tab", { name: "Manga" }).click();

      await expect(noMatches(page)).toBeVisible();
      await expect(emptyCategory(page, "Manga")).toHaveCount(0);
    });

    test("says an empty category has nothing in it, after a category the filter empties", async ({
      page,
    }) => {
      await openOn(page, "Manga");
      await expect(noMatches(page)).toBeVisible();

      await tabs(page).getByRole("tab", { name: "Test" }).click();

      await expect(emptyCategory(page, "Test")).toBeVisible();
      await expect(noMatches(page)).toHaveCount(0);
    });
  },
);

test.describe(
  "while asking whether a category holds anything",
  { tag: "@native" },
  () => {
    let releases: (() => void)[] = [];
    let isAsked = false;
    let filteredReads = 0;
    const holding = backendHolding(LIBRARY);

    test.use({
      backend: {
        ...holding,
        categorySeries: (category, after, listing) => {
          if (category === "test" && filtersOn(listing.filter) > 0) {
            filteredReads += 1;
          }
          return holding.categorySeries(category, after, listing);
        },
        categorySeriesCount: async (category, filter) => {
          if (category === "test" && filtersOn(filter) === 0) {
            isAsked = true;
            await new Promise<void>((release) => {
              releases.push(release);
            });
          }
          return 0;
        },
      },
    });

    test.beforeEach(() => {
      releases = [];
      isAsked = false;
      filteredReads = 0;
    });

    function releaseEveryCount(): void {
      for (const release of releases.splice(0)) {
        release();
      }
    }

    test("says nothing of filters until it knows the category holds nothing, then says so", async ({
      page,
    }) => {
      storedListing = UNREAD_ONLY;
      await openOn(page, "Test");
      await expect.poll(() => isAsked).toBe(true);

      await expect(noMatches(page)).toHaveCount(0);
      await expect(emptyCategory(page, "Test")).toHaveCount(0);
      for (const release of releases) {
        release();
      }

      await expect(emptyCategory(page, "Test")).toBeVisible();
      await expect(noMatches(page)).toHaveCount(0);
    });

    test("keeps an empty category's state on screen while a filter is turned on", async ({
      page,
    }) => {
      await openOn(page, "Test");
      const addSeries = emptyCategory(page, "Test").getByRole("button", {
        name: ADD_SERIES,
      });
      await expect(addSeries).toBeVisible();
      releaseEveryCount();
      await waitForAnswers(page);
      await addSeries.evaluate((button) => {
        Object.assign(window, { addSeriesShown: button });
      });

      await openSortAndFilter(page);
      await chooseUnreadOnly(page);
      await expect.poll(() => filteredReads).toBeGreaterThan(0);
      await expect
        .poll(
          async () => (await commandsAsked(page)).unanswered - releases.length,
        )
        .toBe(0);

      expect(
        await page.evaluate(
          () =>
            (window as Window & { addSeriesShown?: HTMLElement }).addSeriesShown
              ?.isConnected,
        ),
      ).toBe(true);
      releaseEveryCount();
    });
  },
);

test.describe("when counting a category fails", { tag: "@native" }, () => {
  test.use({
    backend: {
      ...backendHolding(LIBRARY),
      categorySeriesCount: (category, filter) => {
        if (category === "test" && filtersOn(filter) === 0) {
          throw new CommandFailure({
            code: "internal",
            message: "the category could not be counted",
          });
        }
        return 0;
      },
    },
  });

  test("says no series match these filters, so they can still be cleared", async ({
    page,
  }) => {
    storedListing = UNREAD_ONLY;

    await openOn(page, "Test");

    await expect(
      noMatches(page).getByRole("button", {
        name: english.library_clear_all_filters,
      }),
    ).toBeVisible();
  });
});

test.describe(
  "while asking whether the library holds anything",
  { tag: "@native" },
  () => {
    let releases: (() => void)[] = [];
    const holding = backendHolding([]);

    test.use({
      backend: {
        ...holding,
        librarySeriesCount: async (filter) => {
          if (filtersOn(filter) === 0) {
            await new Promise<void>((release) => {
              releases.push(release);
            });
          }
          return 0;
        },
      },
    });

    test.beforeEach(() => {
      releases = [];
    });

    function releaseEveryCount(): void {
      for (const release of releases.splice(0)) {
        release();
      }
    }

    test("says nothing of an empty category until it knows the library is empty, then says that", async ({
      page,
    }) => {
      await openOnStoredTab(page, "test");
      await expect.poll(() => releases.length).toBeGreaterThan(0);
      await waitForAnswersBut(page, releases.length);

      await expect(emptyCategory(page, "Test")).toHaveCount(0);
      await expect(noMatches(page)).toHaveCount(0);
      releaseEveryCount();

      await expect(
        page.getByRole("region", { name: english.library_empty }),
      ).toBeVisible();
      await expect(emptyCategory(page, "Test")).toHaveCount(0);
    });

    test("says nothing of filters until it knows the library is empty, then says that", async ({
      page,
    }) => {
      storedListing = UNREAD_ONLY;
      await page.goto("/");
      await expect.poll(() => releases.length).toBeGreaterThan(0);
      await waitForAnswersBut(page, releases.length);

      await expect(noMatches(page)).toHaveCount(0);
      releaseEveryCount();

      await expect(
        page.getByRole("region", { name: english.library_empty }),
      ).toBeVisible();
      await expect(noMatches(page)).toHaveCount(0);
    });
  },
);

test.describe("when the library changes", { tag: "@native" }, () => {
  const shelf: WireSeries[] = [];

  test.use({ backend: backendHolding(shelf) });

  test.beforeEach(() => {
    shelf.splice(0, shelf.length, ...LIBRARY);
  });

  test("says the library is empty once its last series goes under a filter", async ({
    page,
  }) => {
    storedListing = UNREAD_ONLY;
    await page.goto("/");
    await expect(noMatches(page)).toBeVisible();

    shelf.splice(0);
    await emitFakeEvent(page, "library-changed");

    await expect(
      page.getByRole("region", { name: english.library_empty }),
    ).toBeVisible();
    await expect(noMatches(page)).toHaveCount(0);
  });

  test("says a category has nothing in it once its last series goes under a filter", async ({
    page,
  }) => {
    storedListing = UNREAD_ONLY;
    await openOn(page, "Manga");
    await expect(noMatches(page)).toBeVisible();

    shelf.splice(0, shelf.length, ...LIBRARY.slice(MANGA.length));
    await emitFakeEvent(page, "library-changed");

    await expect(emptyCategory(page, "Manga")).toBeVisible();
    await expect(noMatches(page)).toHaveCount(0);
  });
});

test.describe("an empty category's Add series", { tag: "@native" }, () => {
  const shelf: WireSeries[] = [];

  test.use({ backend: backendHolding(shelf) });

  test.beforeEach(() => {
    shelf.splice(0);
  });

  async function lookOf(button: Locator): Promise<readonly string[]> {
    await expect(button).toBeVisible();
    return button.evaluate((shown) => {
      const style = getComputedStyle(shown);
      return [
        style.backgroundColor,
        style.color,
        style.blockSize,
        style.borderStartStartRadius,
        style.fontWeight,
        style.fontSize,
      ];
    });
  }

  test("looks like the empty library's Add a folder, the one main action of an empty screen", async ({
    page,
  }) => {
    await page.goto("/");
    const addFolder = await lookOf(
      page
        .getByRole("region", { name: english.library_empty })
        .getByRole("button", { name: english.library_add_folder }),
    );
    shelf.splice(0, 0, ...LIBRARY);
    await emitFakeEvent(page, "library-changed");
    await tabs(page).getByRole("tab", { name: "Test" }).click();

    const addSeries = await lookOf(
      emptyCategory(page, "Test").getByRole("button", { name: ADD_SERIES }),
    );

    expect(addSeries).toEqual(addFolder);
  });
});

test.describe(
  "when the library changes while a category is being counted",
  { tag: "@native" },
  () => {
    let inTest: readonly WireSeries[] = [];
    let releases: (() => void)[] = [];
    let unfilteredCounts = 0;
    const holding = backendHolding(LIBRARY);

    test.use({
      backend: {
        ...holding,
        categorySeries: (category, after, listing) =>
          category === "test"
            ? pagedSeries(() => letThrough(inTest, listing.filter))(
                after,
                listing,
              )
            : holding.categorySeries(category, after, listing),
        categorySeriesCount: async (category, filter) => {
          if (category !== "test") {
            return holding.categorySeriesCount(category, filter);
          }
          const counted = letThrough(inTest, filter).length;
          if (filtersOn(filter) === 0 && ++unfilteredCounts === 1) {
            await new Promise<void>((release) => {
              releases.push(release);
            });
          }
          return counted;
        },
      },
    });

    test.beforeEach(() => {
      inTest = [];
      releases = [];
      unfilteredCounts = 0;
    });

    test("says no series match once a series lands in the category while its count was on its way", async ({
      page,
    }) => {
      storedListing = UNREAD_ONLY;
      await openOn(page, "Test");
      await expect.poll(() => releases.length).toBe(1);
      inTest = LIBRARY.slice(0, 1);

      await emitFakeEvent(page, "library-changed");
      await waitForAnswersBut(page, releases.length);
      for (const release of releases.splice(0)) {
        release();
      }

      await expect(noMatches(page)).toBeVisible();
      await expect(emptyCategory(page, "Test")).toHaveCount(0);
    });
  },
);

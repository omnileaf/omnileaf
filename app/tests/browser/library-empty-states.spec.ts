import type { Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import type {
  LibraryCategory,
  LibraryFilter,
  LibraryListing,
} from "../../src/lib/ipc/bindings.ts";
import {
  filtersOn,
  NEW_LIBRARY_LISTING,
} from "../../src/lib/library/library-listing.ts";
import {
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
  pagedSeries,
  sampleSeries,
  type WireSeries,
} from "./series-catalog.ts";

const LIBRARY = sampleSeries(6);
const MANGA = LIBRARY.slice(0, 3);
const CATEGORIES = [
  { id: "manga", name: "Manga" },
  { id: "test", name: "Test" },
] as LibraryCategory[];
const UNREAD_ONLY: LibraryListing = {
  ...NEW_LIBRARY_LISTING,
  filter: { ...NEW_LIBRARY_LISTING.filter, unread: "only" },
};

const GO_TO_ALL = english.library_go_to_all.replace(
  "{tab}",
  english.library_category_all,
);

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
    libraryCategories: () => [...CATEGORIES],
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

function noMatches(page: Page) {
  return page.getByRole("region", { name: english.library_no_matches_title });
}

function libraryHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: english.library_title });
}

async function waitForAnswers(page: Page): Promise<void> {
  await expect.poll(async () => (await commandsAsked(page)).unanswered).toBe(0);
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

function emptyCategory(page: Page, name: string) {
  return page.getByRole("region", {
    name: english.library_category_empty.replace("{name}", name),
  });
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

    test("says an empty category has nothing in it yet and how to fill it, and goes to All on asking", async ({
      page,
    }) => {
      await openOn(page, "Test");
      const empty = emptyCategory(page, "Test");

      await expect(empty).toContainText(english.library_category_empty_body);
      await expect(noMatches(page)).toHaveCount(0);
      await empty.getByRole("button", { name: GO_TO_ALL }).click();

      await expect(
        tabs(page).getByRole("tab", { name: "All" }),
      ).toHaveAttribute("aria-selected", "true");
    });

    test("says an empty category has nothing in it yet while a filter is on, since clearing it would show nothing either", async ({
      page,
    }) => {
      storedListing = UNREAD_ONLY;

      await openOn(page, "Test");

      await expect(emptyCategory(page, "Test")).toBeVisible();
      await expect(noMatches(page)).toHaveCount(0);
    });

    test("says nothing is new under New chapters, and goes to All on asking", async ({
      page,
    }) => {
      await openOn(page, "New chapters");
      const empty = page.getByRole("region", {
        name: english.library_new_chapters_empty,
      });

      await expect(empty).toContainText(
        english.library_new_chapters_empty_body,
      );
      await expect(noMatches(page)).toHaveCount(0);
      await empty.getByRole("button", { name: GO_TO_ALL }).click();

      await expect(
        tabs(page).getByRole("tab", { name: "All" }),
      ).toHaveAttribute("aria-selected", "true");
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

    test("goes to All without saying on the way that the library is empty", async ({
      page,
    }) => {
      await noteEveryLibraryEmptyShown(page);
      await openOn(page, "Test");

      await emptyCategory(page, "Test")
        .getByRole("button", { name: GO_TO_ALL })
        .click();
      await expect(
        page.getByRole("list", { name: "Series" }).getByRole("listitem"),
      ).toHaveCount(LIBRARY.length);

      expect(await libraryEmptyShown(page)).toBe(0);
    });

    test("puts focus on the library's heading once Go to All takes the empty category away", async ({
      page,
    }) => {
      await openOn(page, "Test");
      await emptyCategory(page, "Test")
        .getByRole("button", { name: GO_TO_ALL })
        .focus();

      await page.keyboard.press("Enter");

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

    test("keeps Go to All and the focus on it through a library change on an empty category under a filter", async ({
      page,
    }) => {
      storedListing = UNREAD_ONLY;
      await openOn(page, "Test");
      const goToAll = emptyCategory(page, "Test").getByRole("button", {
        name: GO_TO_ALL,
      });
      await goToAll.focus();

      await emitFakeEvent(page, "library-changed");
      await waitForAnswers(page);

      await expect(goToAll).toBeFocused();
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
  "while asking whether a category holds anything",
  { tag: "@native" },
  () => {
    let releases: (() => void)[] = [];
    let isAsked = false;

    test.use({
      backend: {
        ...backendHolding(LIBRARY),
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
    });

    test("says nothing of filters until it knows the category holds nothing, then says so", async ({
      page,
    }) => {
      storedListing = UNREAD_ONLY;
      await openOn(page, "Test");
      await expect.poll(() => isAsked).toBe(true);

      await expect(noMatches(page)).toHaveCount(0);
      for (const release of releases) {
        release();
      }

      await expect(emptyCategory(page, "Test")).toBeVisible();
      await expect(noMatches(page)).toHaveCount(0);
    });
  },
);

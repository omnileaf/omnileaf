import type { Locator, Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import type {
  LibraryCategory,
  LibraryListing,
} from "../../src/lib/ipc/bindings.ts";
import {
  filtersOn,
  NEW_LIBRARY_LISTING,
} from "../../src/lib/library/library-listing.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const NOTE_TO_ACTION = 16;
const LIBRARY = sampleSeries(3);
const CATEGORIES = [
  { id: "manga", name: "Manga" },
  { id: "test", name: "Test" },
] as LibraryCategory[];
const UNREAD_ONLY: LibraryListing = {
  ...NEW_LIBRARY_LISTING,
  filter: { ...NEW_LIBRARY_LISTING.filter, unread: "only" },
};

interface EmptyScreen {
  readonly name: string;
  readonly open: (page: Page) => Promise<void>;
  readonly backend: FakeBackend;
  readonly action: (page: Page) => Locator;
}

function goTo(path: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.goto(path);
  };
}

async function openLibraryOnTest(page: Page): Promise<void> {
  await page.goto("/");
  await page
    .getByRole("tablist", { name: "Categories" })
    .getByRole("tab", { name: "Test" })
    .click();
}

const WITH_AN_EMPTY_CATEGORY: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: () => ({ series: [...LIBRARY], next: null }),
  librarySeriesCount: () => LIBRARY.length,
  libraryCategories: () => [...CATEGORIES],
  libraryTabs: () => [
    { id: { kind: "all" }, isHidden: false },
    { id: { kind: "category", id: "manga" }, isHidden: false },
    { id: { kind: "category", id: "test" }, isHidden: false },
  ],
};

const FILTERED_TO_NOTHING: FakeBackend = {
  ...DEFAULT_BACKEND,
  libraryListing: () => UNREAD_ONLY,
  librarySeries: (_after, listing) => ({
    series: filtersOn(listing.filter) === 0 ? [...LIBRARY] : [],
    next: null,
  }),
  librarySeriesCount: (filter) =>
    filtersOn(filter) === 0 ? LIBRARY.length : 0,
};

const SCREENS: readonly EmptyScreen[] = [
  {
    name: "the empty library",
    open: goTo("/"),
    backend: DEFAULT_BACKEND,
    action: (page) =>
      page
        .getByRole("region", { name: "Your library is empty" })
        .getByRole("button", { name: "Add a folder" }),
  },
  {
    name: "the library that can't be read",
    open: goTo("/"),
    backend: {
      ...DEFAULT_BACKEND,
      librarySeries: () => {
        throw new CommandFailure({
          code: "internal",
          message: "the library could not be read",
        });
      },
    },
    action: (page) =>
      page.getByRole("alert").getByRole("button", { name: "Try again" }),
  },
  {
    name: "History with nothing read",
    open: goTo("/history"),
    backend: DEFAULT_BACKEND,
    action: (page) =>
      page.getByRole("main").getByRole("link", { name: "Go to the library" }),
  },
  {
    name: "a creator with no series left",
    open: goTo("/creator/Author%20A"),
    backend: DEFAULT_BACKEND,
    action: (page) =>
      page
        .getByRole("main")
        .getByRole("link", { name: "Back to the library" })
        .last(),
  },
  {
    name: "an empty category",
    open: openLibraryOnTest,
    backend: WITH_AN_EMPTY_CATEGORY,
    action: (page) =>
      page
        .getByRole("region", {
          name: english.library_category_empty.replace("{name}", "Test"),
        })
        .getByRole("button", { name: english.library_add_series }),
  },
  {
    name: "a library filtered to nothing",
    open: goTo("/"),
    backend: FILTERED_TO_NOTHING,
    action: (page) =>
      page
        .getByRole("region", { name: english.library_no_matches_title })
        .getByRole("button", { name: english.library_clear_all_filters }),
  },
];

function noteOf(page: Page): Locator {
  return page
    .getByRole("main")
    .locator('[data-slot="empty-description"]')
    .first();
}

for (const screen of SCREENS) {
  test.describe(
    `${screen.name} on an Android phone`,
    { tag: "@native" },
    () => {
      test.use({ backend: screen.backend });

      test.beforeEach(({ platform }) => {
        test.skip(platform !== "android", "Android's empty screens");
      });

      test("sets its action 16px under its note, as Material's empty state does", async ({
        page,
      }) => {
        await screen.open(page);
        const action = screen.action(page);
        await expect(action).toBeVisible();

        const [note, button] = await Promise.all([
          boxOf(noteOf(page)),
          boxOf(action),
        ]);

        expect(button.y - (note.y + note.height)).toBe(NOTE_TO_ACTION);
      });
    },
  );
}

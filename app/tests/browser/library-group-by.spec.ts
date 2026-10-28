import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryCategory,
  type LibraryFolder,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { choose, openViewOptions } from "./view-options.ts";

const LIBRARY = sampleSeries(12);
const CATEGORIES = [
  { id: "manga", name: "Manga" },
  { id: "comics", name: "Comics" },
  { id: "empty", name: "Shelved" },
] as LibraryCategory[];
const FOLDERS = [
  ["comics-folder", "Comics"],
  ["manga-folder", "Manga"],
  ["books-folder", "Books"],
].map(([id, name]) => ({
  id,
  kind: "linked",
  name,
  location: `/media/${name ?? ""}`,
  isAvailable: true,
})) as LibraryFolder[];
const IN_CATEGORY: Partial<Record<string, typeof LIBRARY>> = {
  manga: LIBRARY.slice(0, 4),
  comics: LIBRARY.slice(4, 6),
};
const WRITERS = [
  { name: "Author A", seriesCount: 3 },
  { name: "Author B", seriesCount: 2 },
];
const BY_WRITER: Partial<Record<string, typeof LIBRARY>> = {
  "Author A": LIBRARY.slice(0, 3),
  "Author B": LIBRARY.slice(2, 4),
};
const NAMING_NO_WRITER = LIBRARY.slice(4, 6);
const IN_FOLDER: Partial<Record<string, typeof LIBRARY>> = {
  "comics-folder": LIBRARY.slice(0, 7),
  "manga-folder": LIBRARY.slice(7),
};

let storedView: LibraryView = DEFAULT_LIBRARY_VIEW;
let categories: readonly LibraryCategory[] = CATEGORIES;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    libraryCategories: () => [...categories],
    categorySeries: (category, after, listing) =>
      pagedSeries(() => IN_CATEGORY[category] ?? [])(after, listing),
    categorySeriesCount: (category) => (IN_CATEGORY[category] ?? []).length,
    libraryFolders: () => ({ folders: FOLDERS, next: null }),
    folderSeries: (folder, after, listing) =>
      pagedSeries(() => IN_FOLDER[folder] ?? [])(after, listing),
    folderSeriesCount: (folder) => (IN_FOLDER[folder] ?? []).length,
    libraryWriters: () => ({ writers: WRITERS, next: null }),
    writerSeries: (writer, after, listing) =>
      pagedSeries(() => BY_WRITER[writer] ?? [])(after, listing),
    writerSeriesCount: (writer) => (BY_WRITER[writer] ?? []).length,
    writerlessSeries: pagedSeries(() => NAMING_NO_WRITER),
    writerlessSeriesCount: () => NAMING_NO_WRITER.length,
    libraryView: () => storedView,
    setLibraryView: (view) => {
      storedView = view;
      return null;
    },
  } satisfies FakeBackend,
});

test.beforeEach(() => {
  storedView = DEFAULT_LIBRARY_VIEW;
  categories = CATEGORIES;
});

function group(page: Page, name: string): Locator {
  return page.getByRole("region", { name, exact: true });
}

function coversIn(section: Locator): Locator {
  return section.getByRole("list", { name: "Series" }).getByRole("listitem");
}

async function openGroupedBy(page: Page, groupBy: LibraryView["groupBy"]) {
  storedView = { ...DEFAULT_LIBRARY_VIEW, groupBy };
  await page.goto("/");
}

test("groups by nothing in a new library, and keeps the grouping chosen", async ({
  page,
}) => {
  await page.goto("/");
  const options = await openViewOptions(page);
  const groupBy = options.getByRole("radiogroup", { name: "Group by" });

  await expect(groupBy.getByRole("radio", { name: "None" })).toBeChecked();
  await choose(groupBy, "Folder");

  await expect.poll(() => storedView.groupBy).toBe("folder");
});

test("offers Creator beside None, Category and Folder, saying what it does", async ({
  page,
}) => {
  await page.goto("/");
  const options = await openViewOptions(page);
  const groupBy = options.getByRole("radiogroup", { name: "Group by" });

  await expect(groupBy.getByRole("radio")).toHaveText([
    /None/,
    /Category/,
    /Folder/,
    /Creator/,
  ]);
  await expect(groupBy).toHaveAccessibleDescription(
    "Creator puts each series under its writer; a series with two writers shows under both.",
  );
  await choose(groupBy, "Creator");

  await expect.poll(() => storedView.groupBy).toBe("creator");
});

test("draws a section for each folder holding series, saying how many, without the tabs", async ({
  page,
}) => {
  await openGroupedBy(page, "folder");

  await expect(coversIn(group(page, "Comics"))).toHaveCount(7);
  await expect(coversIn(group(page, "Manga"))).toHaveCount(5);
  await expect(group(page, "Comics")).toContainText("7 series");
  await expect(group(page, "Books")).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Categories" })).toHaveCount(
    0,
  );
});

test("draws a section for each category holding series", async ({ page }) => {
  await openGroupedBy(page, "category");

  await expect(coversIn(group(page, "Manga"))).toHaveCount(4);
  await expect(coversIn(group(page, "Comics"))).toHaveCount(2);
  await expect(group(page, "Shelved")).toHaveCount(0);
});

test("lists the whole library when grouped by category with none kept", async ({
  page,
}) => {
  categories = [];
  await openGroupedBy(page, "category");

  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem"),
  ).toHaveCount(LIBRARY.length);
  await expect(page.getByRole("region", { name: "Manga" })).toHaveCount(0);
});

test("draws a section for each writer, then the series naming nobody, without the tabs", async ({
  page,
}) => {
  await openGroupedBy(page, "creator");

  await expect(
    page
      .getByRole("region")
      .filter({ has: page.getByRole("heading", { level: 2 }) }),
  ).toHaveText([
    /^Author A.*3 series/,
    /^Author B.*2 series/,
    /^No creator in the files.*2 series · add one with Edit details on the series page/,
  ]);
  await expect(coversIn(group(page, "Author A"))).toHaveCount(3);
  await expect(coversIn(group(page, "Author B"))).toHaveCount(2);
  await expect(page.getByRole("tablist", { name: "Categories" })).toHaveCount(
    0,
  );
});

test("lists a series with two writers under both", async ({ page }) => {
  await openGroupedBy(page, "creator");
  const shared = LIBRARY[2]?.title ?? "";

  await expect(
    coversIn(group(page, "Author A")).filter({ hasText: shared }),
  ).toHaveCount(1);
  await expect(
    coversIn(group(page, "Author B")).filter({ hasText: shared }),
  ).toHaveCount(1);
});

test("opens a writer's page from their heading", async ({ page }) => {
  await openGroupedBy(page, "creator");

  await group(page, "Author B")
    .getByRole("heading")
    .getByRole("link", { name: "Author B" })
    .click();

  await expect(page).toHaveURL(/\/creator\/Author%20B$/);
});

test("leaves the series naming nobody without a link", async ({ page }) => {
  await openGroupedBy(page, "creator");

  await expect(
    group(page, "No creator in the files").getByRole("heading"),
  ).toBeVisible();
  await expect(
    group(page, "No creator in the files")
      .getByRole("heading")
      .getByRole("link"),
  ).toHaveCount(0);
});

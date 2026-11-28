import type { Locator, Page } from "@playwright/test";

import type {
  CategoryRename,
  LibraryCategory,
  LibraryTab,
} from "../../src/lib/ipc/bindings.ts";
import {
  LIBRARY_OPENS_ON_KEY,
  LIBRARY_TAB_KEY,
} from "../../src/lib/library/library-tab.svelte.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(12);
const MEMBERS: Record<string, typeof LIBRARY> = {
  reading: LIBRARY.slice(0, 2),
  manga: LIBRARY.slice(2, 6),
  comics: LIBRARY.slice(6, 9),
};

let categories: LibraryCategory[] = [];
let renames: (readonly [string, string])[] = [];
let removed: string[] = [];
let tabs: LibraryTab[] = [];
let renameWait: Promise<void> = Promise.resolve();

function folded(name: string): string {
  return name.trim().toLowerCase().replaceAll("ß", "ss");
}

function categoryNamed(id: string, name: string): LibraryCategory {
  return { id, name } as LibraryCategory;
}

async function renameOutcome(
  category: string,
  to: string,
): Promise<CategoryRename> {
  await renameWait;
  const isTaken = categories.some(
    ({ id, name }) => id !== category && folded(name) === folded(to),
  );
  if (isTaken) {
    return { kind: "nameTaken" };
  }
  renames = [...renames, [category, to]];
  categories = categories.map((kept) =>
    kept.id === category ? { ...kept, name: to } : kept,
  );
  return { kind: "renamed" };
}

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: pagedSeries(() => LIBRARY),
  librarySeriesCount: () => LIBRARY.length,
  libraryCategories: () => [...categories],
  categorySeries: (category, after, listing) =>
    pagedSeries(() => MEMBERS[category] ?? [])(after, listing),
  categorySeriesCount: (category) => MEMBERS[category]?.length ?? 0,
  seriesLabels: () => ({
    keepsLabels: true,
    categories: [],
    tags: [],
    suggestedTags: [],
  }),
  renameLibraryCategory: renameOutcome,
  removeLibraryCategory: (category) => {
    removed = [...removed, category];
    categories = categories.filter(({ id }) => id !== category);
    tabs = tabs.filter(
      ({ id }) => !(id.kind === "category" && id.id === category),
    );
    return null;
  },
  libraryTabs: () => [...tabs],
  setLibraryTabs: (kept) => {
    tabs = kept as LibraryTab[];
    return null;
  },
  labelSeries: (_series, changes) => {
    categories = [
      ...categories,
      ...changes.categoriesCreated.map((name) =>
        categoryNamed(name.toLowerCase(), name),
      ),
    ];
    return null;
  },
};

test.use({ backend: BACKEND });

test.beforeEach(({ platform }) => {
  test.skip(
    platform !== undefined,
    "the words and looks of each platform are checked in its own spec",
  );
  categories = [
    categoryNamed("reading", "Reading"),
    categoryNamed("manga", "Manga"),
    categoryNamed("comics", "Comics"),
  ];
  renames = [];
  removed = [];
  tabs = [
    { id: { kind: "all" }, isHidden: false },
    { id: { kind: "newChapters" }, isHidden: true },
  ];
  renameWait = Promise.resolve();
});

function tabList(page: Page): Locator {
  return page.getByRole("list", { name: "Library tabs" });
}

function rowOf(page: Page, name: string): Locator {
  return tabList(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
}

function moreFor(page: Page, name: string): Locator {
  return rowOf(page, name).getByRole("button", { name: `More for ${name}` });
}

async function chooseFromMenu(
  page: Page,
  name: string,
  item: string,
): Promise<void> {
  await moreFor(page, name).click();
  await page.getByRole("menuitem", { name: item }).click();
}

function rowNames(page: Page): Promise<string[]> {
  return tabList(page)
    .getByRole("listitem")
    .evaluateAll((rows) =>
      rows.map(
        (row) => row.querySelector("span > span")?.textContent.trim() ?? "",
      ),
    );
}

test("renames a category in its place, says so and keeps focus on its row", async ({
  page,
}) => {
  await page.goto("/settings/library/tabs");
  await chooseFromMenu(page, "Manga", "Rename…");
  const dialog = page.getByRole("dialog", { name: "Rename category" });
  await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(
    "Manga",
  );

  await dialog.getByRole("textbox", { name: "Name" }).fill("Later");
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();

  await expect(dialog).toBeHidden();
  expect(renames).toEqual([["manga", "Later"]]);
  await expect
    .poll(() => rowNames(page))
    .toEqual(["All", "New chapters", "Reading", "Later", "Comics"]);
  await expect(page.getByRole("status")).toHaveText("Manga renamed to Later");
  await expect(moreFor(page, "Later")).toBeFocused();
});

test("refuses a name another category has and keeps Rename off until it is free", async ({
  page,
}) => {
  await page.goto("/settings/library/tabs");
  await chooseFromMenu(page, "Manga", "Rename…");
  const dialog = page.getByRole("dialog", { name: "Rename category" });
  const field = dialog.getByRole("textbox", { name: "Name" });
  const rename = dialog.getByRole("button", { name: "Rename", exact: true });

  await field.fill("comics");
  await field.press("Enter");

  await expect(dialog.getByText("comics is already a category.")).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(rename).toHaveAttribute("aria-disabled", "true");
  expect(renames).toEqual([]);

  await field.fill("");
  await expect(dialog.getByText("Enter a name.")).toBeVisible();

  await field.fill("Comics too");
  await expect(rename).not.toHaveAttribute("aria-disabled");
});

test("shows the core's refusal when another category took the name meanwhile", async ({
  page,
}) => {
  await page.goto("/settings/library/tabs");
  await chooseFromMenu(page, "Manga", "Rename…");
  const dialog = page.getByRole("dialog", { name: "Rename category" });
  categories = [...categories, categoryNamed("later", "Later")];

  await dialog.getByRole("textbox", { name: "Name" }).fill("Later");
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();

  await expect(dialog.getByText("Later is already a category.")).toBeVisible();
  expect(renames).toEqual([]);
});

test("asks before deleting a category, saying its series stay", async ({
  page,
}) => {
  await page.goto("/settings/library/tabs");
  await chooseFromMenu(page, "Manga", "Delete…");

  const ask = page.getByRole("alertdialog", { name: "Delete Manga?" });
  await expect(ask).toContainText("Its 4 series stay in your library.");
  await ask.getByRole("button", { name: "Cancel" }).click();

  await expect(ask).toBeHidden();
  expect(removed).toEqual([]);
  await expect(rowOf(page, "Manga")).toBeVisible();
});

test("deletes a category, says so and moves focus to the row after it", async ({
  page,
}) => {
  await page.goto("/settings/library/tabs");
  await chooseFromMenu(page, "Manga", "Delete…");

  await page
    .getByRole("alertdialog", { name: "Delete Manga?" })
    .getByRole("button", { name: "Delete" })
    .click();

  expect(removed).toEqual(["manga"]);
  await expect
    .poll(() => rowNames(page))
    .toEqual(["All", "New chapters", "Reading", "Comics"]);
  await expect(page.getByRole("status")).toHaveText("Manga deleted");
  await expect(moreFor(page, "Comics")).toBeFocused();
});

test("moves focus to the row before a deleted last category", async ({
  page,
}) => {
  await page.goto("/settings/library/tabs");
  await chooseFromMenu(page, "Comics", "Delete…");

  await page
    .getByRole("alertdialog", { name: "Delete Comics?" })
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(moreFor(page, "Manga")).toBeFocused();
});

test("opens the library on All once the category it opened on is deleted", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "manga");
  }, LIBRARY_OPENS_ON_KEY);
  await page.goto("/settings/library/tabs");
  await chooseFromMenu(page, "Manga", "Delete…");
  await page
    .getByRole("alertdialog", { name: "Delete Manga?" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(rowOf(page, "Manga")).toHaveCount(0);

  await expect(
    page.getByRole("combobox", { name: "The library opens on" }),
  ).toHaveValue("last");
  await page.goto("/");

  const strip = page.getByRole("tablist", { name: "Categories" });
  await expect(strip.getByRole("tab", { name: "All" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(strip.getByRole("tab", { name: "Manga" })).toHaveCount(0);
});

test("shows a renamed category's new name in the library's tabs", async ({
  page,
}) => {
  await page.goto("/settings/library/tabs");
  await chooseFromMenu(page, "Manga", "Rename…");
  const dialog = page.getByRole("dialog", { name: "Rename category" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Later");
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/");

  const strip = page.getByRole("tablist", { name: "Categories" });
  await expect(strip.getByRole("tab", { name: "Later" })).toBeVisible();
  await expect(strip.getByRole("tab", { name: "Manga" })).toHaveCount(0);
});

test("shows the core's refusal of a name only the core folds to another's", async ({
  page,
}) => {
  categories = [...categories, categoryNamed("strasse", "Strasse")];
  await page.goto("/settings/library/tabs");
  await chooseFromMenu(page, "Manga", "Rename…");
  const dialog = page.getByRole("dialog", { name: "Rename category" });

  await dialog.getByRole("textbox", { name: "Name" }).fill("Straße");
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();

  await expect(dialog.getByText("Straße is already a category.")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Rename", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(renames).toEqual([]);
});

test("sends one rename and says it once when Enter is pressed twice", async ({
  page,
}) => {
  let answer = (): void => undefined;
  renameWait = new Promise((resolve) => {
    answer = resolve;
  });
  await page.goto("/settings/library/tabs");
  await chooseFromMenu(page, "Manga", "Rename…");
  const field = page
    .getByRole("dialog", { name: "Rename category" })
    .getByRole("textbox", { name: "Name" });

  await field.fill("Later");
  await field.press("Enter");
  await field.press("Enter");
  answer();

  await expect(page.getByRole("status")).toHaveText("Manga renamed to Later");
  expect(renames).toEqual([["manga", "Later"]]);
});

test("brings a deleted category's name back as a new shown tab the library does not open on", async ({
  page,
}) => {
  tabs = [
    { id: { kind: "category", id: "manga" }, isHidden: true },
    ...tabs,
  ] as LibraryTab[];
  await page.addInitScript(
    ({ opensOn, usedLast }) => {
      if (sessionStorage.getItem("seeded") === null) {
        sessionStorage.setItem("seeded", "yes");
        localStorage.setItem(opensOn, "manga");
        localStorage.setItem(usedLast, "manga");
      }
    },
    { opensOn: LIBRARY_OPENS_ON_KEY, usedLast: LIBRARY_TAB_KEY },
  );
  await page.goto("/settings/library/tabs");
  await chooseFromMenu(page, "Manga", "Delete…");
  await page
    .getByRole("alertdialog", { name: "Delete Manga?" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(rowOf(page, "Manga")).toHaveCount(0);

  await page.getByRole("button", { name: "New category" }).click();
  const naming = page.getByRole("dialog", { name: "New category" });
  await naming.getByRole("textbox", { name: "Name" }).fill("Manga");
  await naming.getByRole("button", { name: "Add" }).click();

  await expect
    .poll(() => rowNames(page))
    .toEqual(["All", "New chapters", "Reading", "Comics", "Manga"]);
  await expect(rowOf(page, "Manga")).not.toContainText("Hidden");
  await expect(
    page.getByRole("combobox", { name: "The library opens on" }),
  ).toHaveValue("last");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), LIBRARY_TAB_KEY),
  ).toBe("all");
});

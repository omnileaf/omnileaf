import type { Locator, Page } from "@playwright/test";

import type {
  LibraryCategory,
  SeriesLabels,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(4);
const CATEGORIES = [
  { id: "reading", name: "Reading" },
  { id: "manga", name: "Manga" },
  { id: "comics", name: "Comics" },
] as LibraryCategory[];

function labelsFor(series: readonly string[]): SeriesLabels {
  const count = series.length;
  return {
    keepsLabels: true,
    categories: [
      { category: CATEGORIES[0] as LibraryCategory, holding: count },
      { category: CATEGORIES[1] as LibraryCategory, holding: 1 },
      { category: CATEGORIES[2] as LibraryCategory, holding: 0 },
    ],
    tags: [
      { tag: "Sea", holding: count },
      { tag: "Seinen", holding: 1 },
    ],
    suggestedTags: ["Slice of life", "Letters"],
  };
}

type WireChanges = Parameters<FakeBackend["labelSeries"]>[1];

let applied: { series: string[]; changes: WireChanges }[] = [];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: [...LIBRARY], next: null }),
    librarySeriesCount: () => LIBRARY.length,
    libraryCategories: () => [...CATEGORIES],
    seriesLabels: (series) => labelsFor(series),
    labelSeries: (series, changes) => {
      applied = [...applied, { series: [...series], changes }];
      return null;
    },
  } satisfies FakeBackend,
});

test.beforeEach(() => {
  applied = [];
});

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function dialogOf(page: Page): Locator {
  return page.getByRole("dialog", { name: "Categories and tags" });
}

async function pickTwo(page: Page): Promise<void> {
  await page.goto("/");
  await expect(seriesList(page).getByRole("listitem")).toHaveCount(
    LIBRARY.length,
  );
  const links = seriesList(page).getByRole("link");
  if (test.info().project.use.hasTouch === true) {
    const touch = { pointerType: "touch", pointerId: 3, isPrimary: true };
    await links.nth(0).dispatchEvent("pointerdown", touch);
    await page.waitForTimeout(600);
    const first = seriesList(page).getByRole("checkbox").nth(0);
    await first.dispatchEvent("pointerup", touch);
    await first.dispatchEvent("click");
  } else {
    await links.nth(0).click({ modifiers: ["ControlOrMeta"] });
  }
  await seriesList(page).getByRole("checkbox").nth(1).click();
}

async function openLabels(page: Page, from: "Categories" | "Tags") {
  await page
    .getByRole("group", { name: "Selected series" })
    .getByRole("button", { name: from })
    .click();
  await expect(dialogOf(page)).toBeVisible();
  return dialogOf(page);
}

async function done(page: Page): Promise<void> {
  await dialogOf(page).getByRole("button", { name: "Done" }).click();
  await expect(dialogOf(page)).toBeHidden();
}

test("shows each category ticked, half-ticked or not for the series picked", async ({
  page,
}) => {
  await pickTwo(page);

  const dialog = await openLabels(page, "Categories");

  await expect(dialog.getByRole("checkbox", { name: "Reading" })).toBeChecked();
  await expect(
    dialog.getByRole("checkbox", { name: /^Manga/ }),
  ).toHaveAttribute("aria-checked", "mixed");
  await expect(dialog.getByText("1 of the 2 are in it")).toBeVisible();
  await expect(
    dialog.getByRole("checkbox", { name: "Comics" }),
  ).not.toBeChecked();
});

test("puts every series picked in a category ticked, and takes them out of one unticked", async ({
  page,
}) => {
  await pickTwo(page);
  const dialog = await openLabels(page, "Categories");

  await dialog.getByRole("checkbox", { name: "Comics" }).click();
  await dialog.getByRole("checkbox", { name: /^Manga/ }).click();
  await dialog.getByRole("checkbox", { name: /^Manga/ }).click();
  await done(page);

  expect(applied).toHaveLength(1);
  expect(applied[0]?.series).toHaveLength(2);
  expect(applied[0]?.changes).toEqual({
    categoriesAdded: ["comics"],
    categoriesRemoved: ["manga"],
    categoriesCreated: [],
    tagsAdded: [],
    tagsRemoved: [],
  });
});

test("makes a new category for the series picked", async ({ page }) => {
  await pickTwo(page);
  const dialog = await openLabels(page, "Categories");

  await dialog.getByRole("textbox", { name: "New category" }).fill("Holiday");
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("checkbox", { name: "Holiday" })).toBeChecked();
  await done(page);

  expect(applied[0]?.changes.categoriesCreated).toEqual(["Holiday"]);
});

test("adds a tag typed and one suggested, and takes one off every series", async ({
  page,
}) => {
  await pickTwo(page);
  const dialog = await openLabels(page, "Tags");

  await expect(
    dialog.getByRole("textbox", { name: "Add a tag" }),
  ).toBeFocused();
  await expect(dialog.getByText("Seinen · 1 of 2")).toBeVisible();
  await page.keyboard.type("Winter");
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Add Letters" }).click();
  await dialog.getByRole("button", { name: "Remove Sea" }).click();
  await done(page);

  expect(applied[0]?.changes).toEqual({
    categoriesAdded: [],
    categoriesRemoved: [],
    categoriesCreated: [],
    tagsAdded: ["Winter", "Letters"],
    tagsRemoved: ["Sea"],
  });
});

test("the dialog has no accessibility violations", async ({ page }) => {
  await pickTwo(page);
  await openLabels(page, "Categories");

  const violations = await accessibilityViolations(page);

  expect(violations).toEqual([]);
});

test.describe("while the library keeps no categories or tags", () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      librarySeries: () => ({ series: [...LIBRARY], next: null }),
      librarySeriesCount: () => LIBRARY.length,
    },
  });

  test("offers only Mark as read for the series picked", async ({ page }) => {
    await pickTwo(page);

    const bar = page.getByRole("group", { name: "Selected series" });

    await expect(
      bar.getByRole("button", { name: "Mark as read" }),
    ).toBeVisible();
    await expect(bar.getByRole("button", { name: "Categories" })).toHaveCount(
      0,
    );
    await expect(bar.getByRole("button", { name: "Tags" })).toHaveCount(0);
  });
});

import type { Locator, Page } from "@playwright/test";

import type { LibraryCategory } from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  test,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const BOOK = "0190a3e4-0000-8000-8000-0000000b0001";
const LIBRARY = sampleSeries(3).map((series, index) => ({
  ...series,
  unreadCount: 2,
  continuesFrom: index === 0 ? BOOK : null,
}));
let markedRead: string[][] = [];

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: [...LIBRARY], next: null }),
    librarySeriesCount: () => LIBRARY.length,
    libraryCategories: () =>
      [
        { id: "manga", name: "Manga" },
        { id: "comics", name: "Comics" },
      ] as LibraryCategory[],
    seriesLabels: () => ({
      keepsLabels: true,
      categories: [],
      tags: [],
      suggestedTags: [],
    }),
    markSeriesRead: (series) => {
      markedRead = [...markedRead, [...series]];
      return [];
    },
  } satisfies FakeBackend,
});

test.skip(({ hasTouch }) => hasTouch, "a pointer right-clicks");

test.beforeEach(() => {
  markedRead = [];
});

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function menuOf(page: Page): Locator {
  return page.getByRole("menu");
}

function titleOf(index: number): string {
  return LIBRARY[index]?.title ?? "";
}

async function rightClick(page: Page, index: number): Promise<Locator> {
  await page.goto("/");
  const link = seriesList(page).getByRole("link").nth(index);
  await expect(link).toBeVisible();
  await link.click({ button: "right" });
  await expect(menuOf(page)).toBeVisible();
  return menuOf(page);
}

test("offers Continue reading, Open series, Mark as read, Categories and tags and Select on a right-click", async ({
  page,
}) => {
  const menu = await rightClick(page, 0);

  await expect(menu.getByRole("menuitem")).toHaveText([
    "Continue reading",
    "Open series",
    "Mark as read",
    "Categories and tags…",
    "Select",
  ]);
});

test("leaves out Continue reading for a series with nothing to continue", async ({
  page,
}) => {
  const menu = await rightClick(page, 1);

  await expect(menu.getByRole("menuitem").first()).toHaveText("Open series");
});

test("opens the series and its book from the menu", async ({ page }) => {
  const menu = await rightClick(page, 0);

  await menu.getByRole("menuitem", { name: "Continue reading" }).click();

  await expect(page).toHaveURL(new RegExp(`/read/${BOOK}$`));
});

test("marks the series right-clicked read, offering Undo", async ({ page }) => {
  const menu = await rightClick(page, 2);

  await menu.getByRole("menuitem", { name: "Mark as read" }).click();

  await expect(page.getByText("1 series marked as read")).toBeVisible();
  expect(markedRead).toEqual([[LIBRARY[2]?.id]]);
});

test("starts selecting with the series right-clicked", async ({ page }) => {
  const menu = await rightClick(page, 1);

  await menu.getByRole("menuitem", { name: "Select" }).click();

  await expect(
    seriesList(page).getByRole("checkbox", { name: titleOf(1) }),
  ).toBeChecked();
});

test("opens Categories and tags for the series right-clicked", async ({
  page,
}) => {
  const menu = await rightClick(page, 1);

  await menu.getByRole("menuitem", { name: "Categories and tags…" }).click();

  await expect(
    page.getByRole("dialog", { name: "Categories and tags" }),
  ).toContainText("For 1 series.");
});

test("opens the menu from the keyboard on the cover in focus", async ({
  page,
}) => {
  await page.goto("/");
  await seriesList(page).getByRole("link").first().focus();

  await page.keyboard.press("Shift+F10");

  await expect(menuOf(page)).toBeVisible();
});

test("the menu has no accessibility violations", async ({ page }) => {
  await rightClick(page, 0);

  const violations = await accessibilityViolations(page);

  expect(violations).toEqual([]);
});

import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_LISTING,
  type LibraryCategory,
  type LibraryListing,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  screenSizeOf,
  settle,
  test,
  viewportOf,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(60);
const CATEGORIES = [
  { id: "manga", name: "Manga" },
  { id: "comics", name: "Comics" },
] as LibraryCategory[];
const DOCKED_WIDTH = 340;
const SCROLLED = 600;

let storedListing: LibraryListing = DEFAULT_LIBRARY_LISTING;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => LIBRARY),
    librarySeriesCount: () => LIBRARY.length,
    libraryCategories: () => [...CATEGORIES],
    libraryListing: () => storedListing,
    setLibraryListing: (listing) => {
      storedListing = listing;
      return null;
    },
  } satisfies FakeBackend,
});

test.beforeEach(({ page }) => {
  test.skip(
    screenSizeOf(page) !== "desktop",
    "the panel docks only beside a desktop's grid",
  );
  storedListing = DEFAULT_LIBRARY_LISTING;
});

function filterButton(page: Page): Locator {
  return page
    .locator("main header")
    .getByRole("button", { name: /^Sort and filter/ });
}

function panelOf(page: Page): Locator {
  return page.getByRole("complementary", { name: "Sort and filter" });
}

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function tabs(page: Page): Locator {
  return page.getByRole("tablist", { name: "Categories" });
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(seriesList(page).getByRole("listitem").first()).toBeVisible();
}

async function openPanel(page: Page): Promise<Locator> {
  await filterButton(page).click();
  await expect(panelOf(page)).toBeVisible();
  await settle(panelOf(page));
  return panelOf(page);
}

test("docks sort and filter against the end of the window, under the tabs, without a dialog", async ({
  page,
}) => {
  await openLibrary(page);

  const box = await boxOf(await openPanel(page));

  const { width, height } = viewportOf(page);
  const tabsBox = await boxOf(tabs(page));
  expect(box.width).toBe(DOCKED_WIDTH);
  expect(box.x + box.width).toBeCloseTo(width, 0);
  expect(box.y - (tabsBox.y + tabsBox.height)).toBeGreaterThanOrEqual(0);
  expect(box.y - (tabsBox.y + tabsBox.height)).toBeLessThanOrEqual(1);
  expect(box.y + box.height).toBeCloseTo(height, 0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("narrows the grid to make room, and leaves it live", async ({ page }) => {
  await openLibrary(page);
  const before = await boxOf(seriesList(page));

  const box = await boxOf(await openPanel(page));

  const after = await boxOf(seriesList(page));
  expect(after.width).toBeLessThan(before.width);
  expect(after.x + after.width).toBeLessThanOrEqual(box.x);
  await seriesList(page).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/series\//);
});

test("opens and closes from the Filter button, which says whether the panel is open", async ({
  page,
}) => {
  await openLibrary(page);
  await expect(filterButton(page)).toHaveAttribute("aria-expanded", "false");

  await openPanel(page);
  await expect(filterButton(page)).toHaveAttribute("aria-expanded", "true");
  await filterButton(page).click();

  await expect(panelOf(page)).toBeHidden();
  await expect(filterButton(page)).toHaveAttribute("aria-expanded", "false");
});

test("takes focus to its title as it opens, and closes on Escape, handing focus back to Filter", async ({
  page,
}) => {
  await openLibrary(page);
  await filterButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(
    panelOf(page).getByRole("heading", { name: "Sort and filter" }),
  ).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(panelOf(page)).toBeHidden();
  await expect(filterButton(page)).toBeFocused();
});

test("closes with its cross and hands focus back to Filter", async ({
  page,
}) => {
  await openLibrary(page);
  const panel = await openPanel(page);

  await panel.getByRole("button", { name: "Close sort and filter" }).click();

  await expect(panel).toBeHidden();
  await expect(filterButton(page)).toBeFocused();
});

test("says how many series match in its foot, beside Reset", async ({
  page,
}) => {
  await openLibrary(page);
  const panel = await openPanel(page);

  const status = panel.getByRole("status");
  const reset = panel.getByRole("button", { name: "Reset" });

  await expect(status).toHaveText("60 series match");
  const statusBox = await boxOf(status);
  const resetBox = await boxOf(reset);
  expect(resetBox.y).toBeLessThan(statusBox.y + statusBox.height);
  expect(resetBox.y + resetBox.height).toBeGreaterThan(statusBox.y);
  expect(resetBox.x).toBeGreaterThan(statusBox.x);
});

test("hides the filters in use while it is open, since it shows them itself", async ({
  page,
}) => {
  storedListing = {
    ...DEFAULT_LIBRARY_LISTING,
    filter: { unread: "any", started: "hide", finished: "any" },
  };
  await openLibrary(page);
  const inUse = page.getByRole("list", { name: "Filters in use" });
  await expect(inUse).toBeVisible();

  const panel = await openPanel(page);
  await expect(inUse).toHaveCount(0);
  await panel.getByRole("button", { name: "Close sort and filter" }).click();

  await expect(inUse).toBeVisible();
});

test("stays under the toolbar and the tabs as the grid scrolls", async ({
  page,
}) => {
  await openLibrary(page);
  const panel = await openPanel(page);
  const before = await boxOf(panel);
  const tabsBefore = await boxOf(tabs(page));

  await page.getByRole("main").evaluate((main, by) => {
    main.scrollTop = by;
  }, SCROLLED);

  await expect
    .poll(() => page.getByRole("main").evaluate((main) => main.scrollTop))
    .toBeGreaterThan(0);
  expect(await boxOf(panel)).toEqual(before);
  expect(await boxOf(tabs(page))).toEqual(tabsBefore);
});

test("the docked panel has no accessibility violations", async ({ page }) => {
  await openLibrary(page);
  await openPanel(page);

  const violations = await accessibilityViolations(page);

  expect(violations).toEqual([]);
});

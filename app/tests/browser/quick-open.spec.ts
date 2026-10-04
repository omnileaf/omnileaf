import type { Locator, Page } from "@playwright/test";

import {
  type LibrarySearch,
  SEARCH_MAX_CHARS,
} from "../../src/lib/ipc/bindings.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  LARGE_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";
import { sampleSeries, type WireSeries } from "./series-catalog.ts";

const CATALOG: readonly WireSeries[] = sampleSeries(12);
const SERIES_SHOWN = 6;
const PLACES_HOLDING_SE = 6;

function found(search: LibrarySearch): WireSeries[] {
  const text = search.text.trim().toLowerCase();
  return CATALOG.filter((series) => series.title.toLowerCase().includes(text));
}

const SEARCHING_BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  librarySeries: () => ({ series: [...CATALOG], next: null }),
  librarySearch: (_after, search) => ({ series: found(search), next: null }),
  librarySearchCount: (search) => found(search).length,
};

test.use({ backend: SEARCHING_BACKEND });

test.beforeEach(({ page }) => {
  test.skip(viewportOf(page).width < LARGE_MIN_WIDTH, "desktop only");
});

function quickOpen(page: Page): Locator {
  return page.getByRole("dialog", { name: "Quick open" });
}

function field(page: Page): Locator {
  return quickOpen(page).getByRole("combobox", {
    name: "Search or go to a page",
  });
}

function options(page: Page): Locator {
  return quickOpen(page).getByRole("option");
}

function selected(page: Page): Locator {
  return quickOpen(page).getByRole("option", { selected: true });
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("main").getByRole("listitem").first(),
  ).toBeVisible();
}

async function pressQuickOpen(page: Page): Promise<void> {
  await page.keyboard.press("Control+k");
  await expect(field(page)).toBeFocused();
}

test("opens with Control K from anywhere, offering every page", async ({
  page,
}) => {
  await page.goto("/settings/appearance");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await pressQuickOpen(page);

  await expect(
    quickOpen(page).getByRole("group", { name: "Go to" }).getByRole("option"),
  ).toHaveCount(8);
  await expect(selected(page)).toContainText("Library");
});

test("finds series and pages by what is typed", async ({ page }) => {
  await openLibrary(page);
  await pressQuickOpen(page);

  await field(page).fill("se");

  const series = quickOpen(page).getByRole("group", { name: "Series" });
  await expect(series.getByRole("option")).toHaveCount(SERIES_SHOWN);
  await expect(series.getByRole("option").first()).toContainText(
    "Sample Series 0001",
  );
  await expect(
    quickOpen(page).getByRole("group", { name: "Go to" }).getByRole("option"),
  ).toHaveText([
    /Browse/,
    /^\s*Settings\s*$/,
    /Library/,
    /Appearance/,
    /General/,
    /About/,
  ]);
});

test("moves through the choices with the arrow keys and jumps groups with Tab", async ({
  page,
}) => {
  await openLibrary(page);
  await pressQuickOpen(page);
  await field(page).fill("se");
  await expect(options(page)).toHaveCount(SERIES_SHOWN + PLACES_HOLDING_SE);

  await field(page).press("ArrowDown");
  const second = await selected(page).innerText();
  await field(page).press("Tab");
  const firstPlace = await selected(page).innerText();
  await field(page).press("ArrowUp");
  const lastSeries = await selected(page).innerText();

  expect([second, firstPlace, lastSeries]).toEqual([
    expect.stringContaining("Sample Series 0002"),
    expect.stringContaining("Browse"),
    expect.stringContaining("Sample Series 0006"),
  ]);
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveAttribute(
    "aria-activedescendant",
    (await selected(page).getAttribute("id")) ?? "",
  );
});

test("goes to the page chosen with Enter", async ({ page }) => {
  await openLibrary(page);
  await pressQuickOpen(page);

  await field(page).fill("appear");
  await field(page).press("Enter");

  await expect(quickOpen(page)).toBeHidden();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Appearance" }),
  ).toBeFocused();
});

test("shows the series chosen on the search page", async ({ page }) => {
  await openLibrary(page);
  await pressQuickOpen(page);

  await field(page).fill("0007");
  await options(page).first().click();

  await expect(page).toHaveURL(/\/search\?q=Sample\+Series\+0007$/);
  await expect(
    page.getByRole("list", { name: "Series found" }).getByRole("listitem"),
  ).toHaveText([/Sample Series 0007/]);
});

test("shows another series chosen while the search page is open", async ({
  page,
}) => {
  await page.goto("/search?q=Sample+Series+0007");
  await expect(
    page.getByRole("list", { name: "Series found" }).getByRole("listitem"),
  ).toHaveText([/Sample Series 0007/]);
  await pressQuickOpen(page);

  await field(page).fill("0008");
  await field(page).press("Enter");

  await expect(
    page.getByRole("searchbox", { name: "Search your library" }),
  ).toHaveValue("Sample Series 0008");
  await expect(
    page.getByRole("list", { name: "Series found" }).getByRole("listitem"),
  ).toHaveText([/Sample Series 0008/]);
});

test("takes no more text than a search reads", async ({ page }) => {
  await openLibrary(page);
  await pressQuickOpen(page);

  await field(page).fill("s".repeat(SEARCH_MAX_CHARS + 1));

  await expect(field(page)).toHaveValue("s".repeat(SEARCH_MAX_CHARS));
});

test("closes with Escape and gives focus back to where it was", async ({
  page,
}) => {
  await openLibrary(page);
  const filter = page
    .locator("main header")
    .getByRole("button", { name: /^Filter and sort/ });
  await filter.focus();
  await pressQuickOpen(page);

  await page.keyboard.press("Escape");

  await expect(quickOpen(page)).toBeHidden();
  await expect(filter).toBeFocused();
});

test.describe("on macOS", () => {
  test.use(onPlatform("macos"));

  test("opens with Command K and says so", async ({ page }) => {
    await page.goto("/history");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.keyboard.press("Meta+k");

    await expect(field(page)).toBeFocused();
    await expect(quickOpen(page).getByText("⌘ K from anywhere")).toBeVisible();
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`quick open has no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openLibrary(page);
    await pressQuickOpen(page);
    await field(page).fill("se");
    await expect(options(page)).toHaveCount(SERIES_SHOWN + PLACES_HOLDING_SE);

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

import type { Locator, Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_LISTING,
  type LibraryFilter,
  type LibraryListing,
} from "../../src/lib/ipc/bindings.ts";
import { pseudoText } from "../../src/lib/language/pseudo-locale.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  screenSizeOf,
  test,
  viewportOf,
} from "./fixtures.ts";
import type { WireSeries } from "./series-catalog.ts";

interface FakeSeries {
  readonly series: WireSeries;
  readonly addedAt: number;
  readonly isStarted: boolean;
}

const PANEL_WIDTH = 380;

function fakeSeries(
  number: number,
  {
    addedAt,
    unread,
    isStarted,
  }: { addedAt: number; unread: number; isStarted: boolean },
): FakeSeries {
  const name = String(number).padStart(2, "0");
  return {
    series: {
      id: `0190a3e4-0000-8000-8000-0000000000${name}`,
      title: `Sample Series ${name}`,
      bookCount: 2,
      unreadCount: unread,
      cover: null,
    },
    addedAt,
    isStarted,
  };
}

const CATALOG: readonly FakeSeries[] = [
  fakeSeries(1, { addedAt: 3, unread: 2, isStarted: false }),
  fakeSeries(2, { addedAt: 6, unread: 2, isStarted: true }),
  fakeSeries(3, { addedAt: 1, unread: 1, isStarted: true }),
  fakeSeries(4, { addedAt: 5, unread: 0, isStarted: true }),
  fakeSeries(5, { addedAt: 2, unread: 2, isStarted: false }),
  fakeSeries(6, { addedAt: 4, unread: 0, isStarted: true }),
];

function meets(
  inclusion: LibraryFilter[keyof LibraryFilter],
  condition: boolean,
): boolean {
  switch (inclusion) {
    case "any":
      return true;
    case "only":
      return condition;
    case "hide":
      return !condition;
  }
}

function letThrough(filter: LibraryFilter): readonly FakeSeries[] {
  return CATALOG.filter(
    ({ series, isStarted }) =>
      meets(filter.unread, series.unreadCount > 0) &&
      meets(filter.started, isStarted) &&
      meets(filter.finished, series.unreadCount === 0),
  );
}

/** Lists the catalog as the engine would, filtered and then sorted, on one page. */
function listed(listing: LibraryListing): WireSeries[] {
  const sign = listing.sort.direction === "ascending" ? 1 : -1;
  return letThrough(listing.filter)
    .toSorted((one, other) =>
      listing.sort.by === "title"
        ? sign * one.series.title.localeCompare(other.series.title)
        : sign * (one.addedAt - other.addedAt),
    )
    .map(({ series }) => series);
}

function titles(numbers: readonly number[]): string[] {
  return numbers.map(
    (number) => `Sample Series ${String(number).padStart(2, "0")}`,
  );
}

let storedListing: LibraryListing = DEFAULT_LIBRARY_LISTING;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: (_after, listing) => ({
      series: listed(listing),
      next: null,
    }),
    librarySeriesCount: (filter) => letThrough(filter).length,
    libraryListing: () => storedListing,
    setLibraryListing: (listing) => {
      storedListing = listing;
      return null;
    },
  },
});

test.beforeEach(() => {
  storedListing = DEFAULT_LIBRARY_LISTING;
});

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function filterButton(page: Page): Locator {
  return page
    .locator("main header")
    .getByRole("button", { name: /^Filter and sort/ });
}

function filterAndSort(page: Page): Locator {
  return page.getByRole("dialog", { name: "Filter and sort" });
}

function isPhone(page: Page): boolean {
  return screenSizeOf(page) === "phone";
}

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(seriesList(page).getByRole("listitem").first()).toBeVisible();
}

async function listedTitles(page: Page): Promise<string[]> {
  return seriesList(page).getByRole("listitem").allInnerTexts();
}

async function expectTitles(page: Page, numbers: readonly number[]) {
  await expect(seriesList(page).getByRole("listitem")).toHaveText(
    titles(numbers).map((title) => new RegExp(title)),
  );
}

async function openFilterAndSort(page: Page): Promise<Locator> {
  await filterButton(page).click();
  await expect(filterAndSort(page)).toBeVisible();
  return filterAndSort(page);
}

async function showFilters(panel: Locator, page: Page): Promise<void> {
  if (isPhone(page)) {
    await panel.getByRole("tab", { name: /^Filter/ }).click();
  }
}

async function showSorts(panel: Locator, page: Page): Promise<void> {
  if (isPhone(page)) {
    await panel.getByRole("tab", { name: "Sort" }).click();
  }
}

async function filterBy(
  page: Page,
  condition: "Unread" | "Started" | "Finished",
  inclusion: "Any" | "Only" | "Hide",
): Promise<void> {
  const panel = filterAndSort(page);
  await showFilters(panel, page);
  await panel
    .getByRole("radiogroup", { name: condition })
    .locator("label")
    .filter({ hasText: inclusion })
    .click();
}

async function sortBy(page: Page, sort: "Title" | "Date added") {
  const panel = filterAndSort(page);
  await showSorts(panel, page);
  if (isPhone(page)) {
    await panel.locator("label").filter({ hasText: sort }).click();
  } else {
    await panel.getByRole("combobox", { name: "Sort by" }).selectOption(sort);
  }
}

function directionButton(page: Page, name: string): Locator {
  return filterAndSort(page).getByRole("button", { name });
}

test("opens filter and sort from the library's header", async ({ page }) => {
  await openLibrary(page);

  const panel = await openFilterAndSort(page);

  await expect(
    panel.getByRole("heading", { name: "Filter and sort" }),
  ).toBeVisible();
  if (isPhone(page)) {
    await expect(panel.getByRole("tab", { name: "Filter" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  } else {
    await expect(panel.getByRole("combobox", { name: "Sort by" })).toHaveValue(
      "title",
    );
  }
});

test("lists only the series with a book not marked read once Unread is set to Only, and stores it", async ({
  page,
}) => {
  await openLibrary(page);
  await openFilterAndSort(page);

  await filterBy(page, "Unread", "Only");

  await expectTitles(page, [1, 2, 3, 5]);
  await expect.poll(() => storedListing.filter.unread).toBe("only");
});

test("leaves out the finished series once Finished is set to Hide, and those never opened once Started is set to Only", async ({
  page,
}) => {
  await openLibrary(page);
  await openFilterAndSort(page);

  await filterBy(page, "Finished", "Hide");
  await filterBy(page, "Started", "Only");

  await expectTitles(page, [2, 3]);
  await expect
    .poll(() => storedListing.filter)
    .toEqual({ unread: "any", started: "only", finished: "hide" });
});

test("lists the series added last first once date added is chosen, and reverses them on asking", async ({
  page,
}) => {
  await openLibrary(page);
  await openFilterAndSort(page);

  await sortBy(page, "Date added");

  await expectTitles(page, [2, 4, 6, 1, 5, 3]);
  await directionButton(
    page,
    "Order: newest first. Change to oldest first",
  ).click();
  await expectTitles(page, [3, 5, 1, 6, 4, 2]);
  await expect
    .poll(() => storedListing.sort)
    .toEqual({ by: "dateAdded", direction: "ascending" });
});

test("lists the titles from Z to A on asking", async ({ page }) => {
  await openLibrary(page);
  await openFilterAndSort(page);
  await showSorts(filterAndSort(page), page);

  await directionButton(page, "Order: A to Z. Change to Z to A").click();

  await expectTitles(page, [6, 5, 4, 3, 2, 1]);
  await expect(
    directionButton(page, "Order: Z to A. Change to A to Z"),
  ).toBeVisible();
});

test("says how many series the filter lets through", async ({ page }) => {
  await openLibrary(page);
  const panel = await openFilterAndSort(page);

  await filterBy(page, "Unread", "Hide");

  if (isPhone(page)) {
    await panel.getByRole("button", { name: "Show 2 series" }).click();
    await expect(panel).toBeHidden();
  } else {
    await expect(panel.getByText("2 series match")).toBeVisible();
  }
});

test("marks the filter button with how many filters are on", async ({
  page,
}) => {
  await openLibrary(page);
  await openFilterAndSort(page);
  await filterBy(page, "Unread", "Only");
  await filterBy(page, "Finished", "Hide");

  await page.keyboard.press("Escape");

  await expect(filterButton(page)).toHaveAccessibleName(
    "Filter and sort, 2 filters on",
  );
  if (viewportOf(page).width >= 1200) {
    await expect(filterButton(page)).toContainText("2");
  }
});

test("puts the sort and every filter back as a new library has them on Reset", async ({
  page,
}) => {
  storedListing = {
    sort: { by: "dateAdded", direction: "ascending" },
    filter: { unread: "only", started: "any", finished: "any" },
  };
  await openLibrary(page);
  const panel = await openFilterAndSort(page);

  await panel.getByRole("button", { name: "Reset" }).click();

  await expectTitles(page, [1, 2, 3, 4, 5, 6]);
  await expect.poll(() => storedListing).toEqual(DEFAULT_LIBRARY_LISTING);
});

test("lists the library by the sort and filter stored on this device", async ({
  page,
}) => {
  storedListing = {
    sort: { by: "dateAdded", direction: "descending" },
    filter: { unread: "only", started: "any", finished: "any" },
  };

  await openLibrary(page);

  await expectTitles(page, [2, 1, 5, 3]);
  await expect(filterButton(page)).toHaveAccessibleName(
    "Filter and sort, 1 filter on",
  );
});

test("says when no series meet the filter and clears it on asking", async ({
  page,
}) => {
  storedListing = {
    sort: DEFAULT_LIBRARY_LISTING.sort,
    filter: { unread: "only", started: "any", finished: "only" },
  };
  await page.goto("/");
  const noMatches = page.getByText("No series match these filters.");
  await expect(noMatches).toBeVisible();
  await expect(filterButton(page)).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();

  await expectTitles(page, [1, 2, 3, 4, 5, 6]);
  await expect.poll(() => storedListing).toEqual(DEFAULT_LIBRARY_LISTING);
});

test("closes on Escape and hands focus back to the button that opened it", async ({
  page,
}) => {
  await openLibrary(page);
  await filterButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(filterAndSort(page)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(filterAndSort(page)).toBeHidden();
  await expect(filterButton(page)).toBeFocused();
});

test("moves between Any, Only and Hide with the arrow keys", async ({
  page,
}) => {
  await openLibrary(page);
  const panel = await openFilterAndSort(page);
  const unread = panel.getByRole("radiogroup", { name: "Unread" });
  await unread.getByRole("radio", { name: "Any" }).focus();

  await page.keyboard.press("ArrowRight");

  await expect(unread.getByRole("radio", { name: "Only" })).toBeChecked();
  await expectTitles(page, [1, 2, 3, 5]);
});

test("moves between the filter and the sort with the arrow keys on a phone", async ({
  page,
}) => {
  test.skip(
    !isPhone(page),
    "wider screens show the filter and the sort together",
  );
  await openLibrary(page);
  const panel = await openFilterAndSort(page);
  await panel.getByRole("tab", { name: "Filter" }).focus();

  await page.keyboard.press("ArrowRight");

  const sort = panel.getByRole("tab", { name: "Sort" });
  await expect(sort).toBeFocused();
  await expect(sort).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("radio", { name: "Date added" })).toBeAttached();
});

test("slides up from the foot of a phone, and stands against the end of wider screens", async ({
  page,
}) => {
  await openLibrary(page);
  const panel = await openFilterAndSort(page);

  const box = await boxOf(panel);

  const { width, height } = viewportOf(page);
  expect(box.y + box.height).toBeCloseTo(height, 0);
  if (isPhone(page)) {
    expect(box.width).toBe(width);
  } else {
    expect(box.y).toBe(0);
    expect(box.width).toBe(PANEL_WIDTH);
    expect(box.x + box.width).toBeCloseTo(width, 0);
    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toBeHidden();
  }
});

test("stands against the left of wider screens in a right-to-left layout", async ({
  page,
}) => {
  await openLibrary(page);
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });

  const box = await boxOf(await openFilterAndSort(page));

  expect(box.x).toBe(0);
});

test("keeps filter and sort inside the screen in a longer language", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("omnileaf.language", "en-XA");
  });
  await page.goto("/");
  await expect(
    page.getByRole("main").getByRole("listitem").first(),
  ).toBeVisible();
  await page
    .locator("main header")
    .getByRole("button", { name: pseudoText("Filter and sort") })
    .click();

  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  const overflows = await panel.evaluate(
    (element) => element.scrollWidth > element.clientWidth,
  );

  expect(overflows).toBe(false);
});

test("explains the unread and finished conditions on phones, where the sheet has room", async ({
  page,
}) => {
  await openLibrary(page);
  const panel = await openFilterAndSort(page);
  await showFilters(panel, page);

  const hints = [
    panel.getByText("Has books you haven't read"),
    panel.getByText("You've read every book"),
  ];

  for (const hint of hints) {
    await expect(hint).toBeVisible({ visible: isPhone(page) });
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`filter and sort have no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    storedListing = {
      sort: DEFAULT_LIBRARY_LISTING.sort,
      filter: { unread: "only", started: "any", finished: "any" },
    };
    await openLibrary(page);
    const panel = await openFilterAndSort(page);
    await expect(
      panel.getByRole("radio", { name: "Only" }).first(),
    ).toBeChecked();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test("the sort list has no accessibility violations", async ({ page }) => {
  await openLibrary(page);
  const panel = await openFilterAndSort(page);
  await showSorts(panel, page);

  const violations = await accessibilityViolations(page);

  expect(violations).toEqual([]);
  expect(await listedTitles(page)).toHaveLength(CATALOG.length);
});

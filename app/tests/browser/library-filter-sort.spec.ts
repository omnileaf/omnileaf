import type { Locator, Page } from "@playwright/test";

import type {
  Inclusion,
  LibraryFilter,
  LibraryListing,
} from "../../src/lib/ipc/bindings.ts";
import { pseudoText } from "../../src/lib/language/pseudo-locale.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  screenSizeOf,
  settle,
  test,
  viewportOf,
} from "./fixtures.ts";
import type { WireSeries } from "./series-catalog.ts";
import { NEW_LIBRARY_LISTING } from "../../src/lib/library/library-listing.ts";

type Box = Awaited<ReturnType<typeof boxOf>>;

interface FakeSeries {
  readonly series: WireSeries;
  readonly addedAt: number;
  readonly isStarted: boolean;
}

const PANEL_WIDTH = 380;
const BADGE_ON_PHONES = 40;
const BADGE_ON_WIDER_SCREENS = 36;
const TOUCH_TARGET = 48;

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
      language: null,
      hasDownloads: false,
      continuesFrom: null,
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

function meets(inclusion: Inclusion, condition: boolean): boolean {
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

let storedListing: LibraryListing = NEW_LIBRARY_LISTING;

const FILTERING_BACKEND = {
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
} satisfies FakeBackend;

test.use({ backend: FILTERING_BACKEND });

test.beforeEach(() => {
  storedListing = NEW_LIBRARY_LISTING;
});

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function filterButton(page: Page): Locator {
  return page
    .getByRole("main")
    .getByRole("button", { name: /^Sort and filter/ });
}

function isDocked(page: Page): boolean {
  return screenSizeOf(page) === "desktop";
}

function panelRole(page: Page): "complementary" | "dialog" {
  return isDocked(page) ? "complementary" : "dialog";
}

function filterAndSort(page: Page): Locator {
  return page.getByRole(panelRole(page), { name: "Sort and filter" });
}

function isBesideTitle(box: Box, title: Box): boolean {
  const middle = box.y + box.height / 2;
  return middle > title.y && middle < title.y + title.height;
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
  await settle(filterAndSort(page));
  return filterAndSort(page);
}

function readStates(page: Page): Locator {
  return filterAndSort(page).getByRole("group", { name: "Read state" });
}

async function chooseReadState(
  page: Page,
  state: "Any" | "Unread" | "In progress" | "Read",
): Promise<void> {
  await readStates(page)
    .getByRole("radio", { name: state, exact: true })
    .click();
}

async function sortBy(page: Page, sort: "Title" | "Date added") {
  await filterAndSort(page)
    .getByRole("combobox", { name: "Sort by" })
    .selectOption(sort);
}

function directionButton(page: Page, name: string): Locator {
  return filterAndSort(page).getByRole("button", { name });
}

test("opens filter and sort from the library's header", async ({ page }) => {
  await openLibrary(page);

  const panel = await openFilterAndSort(page);

  await expect(
    panel.getByRole("heading", { name: "Sort and filter" }),
  ).toBeVisible();
  await expect(panel.getByRole("combobox", { name: "Sort by" })).toHaveValue(
    "title",
  );
  await expect(
    readStates(page).getByRole("radio", { name: "Any" }),
  ).toBeChecked();
});

test("heads filter and sort with a round accent badge beside its title, with Reset on the same line", async ({
  page,
}) => {
  await openLibrary(page);
  const panel = await openFilterAndSort(page);
  const title = panel.getByRole("heading", { name: "Sort and filter" });
  const badge = title.locator("xpath=preceding-sibling::*[1]");
  const size = isPhone(page) ? BADGE_ON_PHONES : BADGE_ON_WIDER_SCREENS;

  const titleBox = await boxOf(title);
  const badgeBox = await boxOf(badge);

  expect([badgeBox.width, badgeBox.height]).toEqual([size, size]);
  expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(titleBox.x);
  expect(isBesideTitle(badgeBox, titleBox)).toBe(true);
  await expect(badge).toHaveAttribute("aria-hidden", "true");
  await expect(badge.locator("svg")).toHaveCount(1);
  expect(
    await badge.evaluate((element) => {
      const style = getComputedStyle(element);
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--color-accent-soft)";
      document.body.append(probe);
      const accentSoft = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return [
        style.backgroundColor === accentSoft,
        Number.parseFloat(style.borderRadius) >= element.clientWidth / 2,
      ];
    }),
  ).toEqual([true, true]);
  const onTheTitleLine = isDocked(page)
    ? [panel.getByRole("button", { name: "Close sort and filter" })]
    : [panel.getByRole("button", { name: "Reset" })];
  if (screenSizeOf(page) === "tablet") {
    onTheTitleLine.push(panel.getByRole("button", { name: "Close" }));
  }
  for (const button of onTheTitleLine) {
    expect(isBesideTitle(await boxOf(button), titleBox)).toBe(true);
  }
});

test("lists only the series never opened once Unread is chosen, and stores it", async ({
  page,
}) => {
  await openLibrary(page);
  await openFilterAndSort(page);

  await chooseReadState(page, "Unread");

  await expectTitles(page, [1, 5]);
  await expect
    .poll(() => storedListing.filter)
    .toEqual({
      ...NEW_LIBRARY_LISTING.filter,
      unread: "any",
      started: "hide",
      finished: "any",
    });
});

test("lists the series opened and not finished once In progress is chosen, and the finished ones once Read is", async ({
  page,
}) => {
  await openLibrary(page);
  await openFilterAndSort(page);

  await chooseReadState(page, "In progress");
  await expectTitles(page, [2, 3]);
  await chooseReadState(page, "Read");

  await expectTitles(page, [4, 6]);
  await expect
    .poll(() => storedListing.filter)
    .toEqual({
      ...NEW_LIBRARY_LISTING.filter,
      unread: "any",
      started: "any",
      finished: "only",
    });
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

  await directionButton(page, "Order: A to Z. Change to Z to A").click();

  await expectTitles(page, [6, 5, 4, 3, 2, 1]);
  await expect(
    directionButton(page, "Order: Z to A. Change to A to Z"),
  ).toBeVisible();
});

test("says how many series the filter lets through", async ({ page }) => {
  await openLibrary(page);
  const panel = await openFilterAndSort(page);

  await chooseReadState(page, "Read");

  if (isPhone(page)) {
    await panel.getByRole("button", { name: "Show 2 series" }).click();
    await expect(panel).toBeHidden();
  } else {
    await expect(panel.getByText("2 series match")).toBeVisible();
  }
});

test("tells screen readers how many series match as the filter changes", async ({
  page,
}) => {
  await openLibrary(page);
  const panel = await openFilterAndSort(page);

  await chooseReadState(page, "Read");

  await expect(panel.getByRole("status")).toHaveText("2 series match");
});

test("marks the filter button with how many filters are on", async ({
  page,
}) => {
  await openLibrary(page);
  await openFilterAndSort(page);
  await chooseReadState(page, "In progress");

  await page.keyboard.press("Escape");

  await expect(filterButton(page)).toHaveAccessibleName(
    "Sort and filter, 1 filter on",
  );
  await expect(filterButton(page)).toContainText("1");
});

test("puts the sort and every filter back as a new library has them on Reset", async ({
  page,
}) => {
  storedListing = {
    sort: { by: "dateAdded", direction: "ascending" },
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "only",
      started: "any",
      finished: "any",
    },
  };
  await openLibrary(page);
  const panel = await openFilterAndSort(page);

  await panel.getByRole("button", { name: "Reset" }).click();

  await expectTitles(page, [1, 2, 3, 4, 5, 6]);
  await expect.poll(() => storedListing).toEqual(NEW_LIBRARY_LISTING);
});

test("lists the library by the sort and filter stored on this device", async ({
  page,
}) => {
  storedListing = {
    sort: { by: "dateAdded", direction: "descending" },
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "only",
      started: "any",
      finished: "any",
    },
  };

  await openLibrary(page);

  await expectTitles(page, [2, 1, 5, 3]);
  await expect(filterButton(page)).toHaveAccessibleName(
    "Sort and filter, 1 filter on",
  );
});

test("says when no series meet the filter and clears it on asking", async ({
  page,
}) => {
  storedListing = {
    sort: NEW_LIBRARY_LISTING.sort,
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "only",
      started: "any",
      finished: "only",
    },
  };
  await page.goto("/");
  const noMatches = page.getByRole("region", {
    name: "No series match these filters",
  });
  await expect(noMatches).toContainText("Your library hasn't changed.");
  await expect(filterButton(page)).toBeVisible();

  await noMatches.getByRole("button", { name: "Clear all filters" }).click();

  await expectTitles(page, [1, 2, 3, 4, 5, 6]);
  await expect.poll(() => storedListing).toEqual(NEW_LIBRARY_LISTING);
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

test("moves between the read states with the arrow keys and picks one with Space", async ({
  page,
}) => {
  await openLibrary(page);
  await openFilterAndSort(page);
  await readStates(page).getByRole("radio", { name: "Any" }).focus();

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");

  await expect(
    readStates(page).getByRole("radio", { name: "Unread" }),
  ).toBeChecked();
  await expectTitles(page, [1, 5]);
});

test("slides up from the foot of a phone, and stands against the end of wider screens", async ({
  page,
}) => {
  test.skip(isDocked(page), "a desktop docks the panel beside the grid");
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
    .getByRole("button", { name: pseudoText("Sort and filter") })
    .click();

  const panel = page.getByRole(panelRole(page));
  await expect(panel).toBeVisible();
  const overflows = await panel.evaluate(
    (element) => element.scrollWidth > element.clientWidth,
  );

  expect(overflows).toBe(false);
});

for (const language of ["en", "en-XA"] as const) {
  const text = (english: string) =>
    language === "en" ? english : pseudoText(english);

  test(`keeps the read states' boxes still as the choice changes in ${language}`, async ({
    page,
  }) => {
    await page.addInitScript((language) => {
      window.localStorage.setItem("omnileaf.language", language);
    }, language);
    await page.goto("/");
    await expect(
      page.getByRole("main").getByRole("listitem").first(),
    ).toBeVisible();
    await page
      .locator("main header")
      .getByRole("button", { name: text("Sort and filter") })
      .click();
    const panel = page.getByRole(panelRole(page));
    await expect(panel).toBeVisible();
    await settle(panel);
    const segments = panel
      .getByRole("group", { name: text("Read state") })
      .getByRole("radio");
    const boxesOf = async (choices: Locator) => {
      const boxes = [];
      for (const choice of await choices.all()) {
        boxes.push(await boxOf(choice));
      }
      return boxes;
    };

    const segmentsBefore = await boxesOf(segments);
    for (const choice of [text("Read"), text("Unread")]) {
      await segments.filter({ hasText: new RegExp(`^${choice}$`) }).click();
      await expect(
        segments.filter({ hasText: new RegExp(`^${choice}$`) }),
      ).toBeChecked();
      expect(await boxesOf(segments)).toEqual(segmentsBefore);
    }
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`filter and sort have no accessibility violations in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    storedListing = {
      sort: NEW_LIBRARY_LISTING.sort,
      filter: {
        ...NEW_LIBRARY_LISTING.filter,
        unread: "any",
        started: "hide",
        finished: "any",
      },
    };
    await openLibrary(page);
    await openFilterAndSort(page);
    await expect(
      readStates(page).getByRole("radio", { name: "Unread" }),
    ).toBeChecked();

    const violations = await accessibilityViolations(page);

    expect(violations).toEqual([]);
  });
}

test("the sort list has no accessibility violations", async ({ page }) => {
  await openLibrary(page);
  await openFilterAndSort(page);

  const violations = await accessibilityViolations(page);

  expect(violations).toEqual([]);
  expect(await listedTitles(page)).toHaveLength(CATALOG.length);
});

test.describe("when a filter leaves no series", () => {
  test.use({
    backend: {
      ...FILTERING_BACKEND,
      librarySeries: (after, listing) =>
        listing.filter.started === "only"
          ? { series: [], next: null }
          : FILTERING_BACKEND.librarySeries(after, listing),
    },
  });

  test("keeps filter and sort open as the filter is set back to Any, and lists the series again", async ({
    page,
  }) => {
    await openLibrary(page);
    await openFilterAndSort(page);
    await chooseReadState(page, "In progress");
    await expect(
      page.getByRole("region", { name: "No series match these filters" }),
    ).toBeVisible();

    await chooseReadState(page, "Any");

    await expectTitles(page, [1, 2, 3, 4, 5, 6]);
    await expect(filterAndSort(page)).toBeVisible();
  });
});

test.describe("when the library holds no series and a filter is stored", () => {
  test.use({
    backend: {
      ...FILTERING_BACKEND,
      librarySeries: () => ({ series: [], next: null }),
      librarySeriesCount: () => 0,
      libraryListing: () => ({
        ...NEW_LIBRARY_LISTING,
        filter: { ...NEW_LIBRARY_LISTING.filter, unread: "only" },
      }),
    },
  });

  test("says the library is empty and offers adding a folder instead of blaming the filter", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByText("Your library is empty")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "No series match these filters" }),
    ).toBeHidden();
  });
});

test("slides in as it opens, which reduced motion turns into appearing at once", async ({
  page,
}) => {
  test.skip(isDocked(page), "a desktop docks the panel at once");
  await openLibrary(page);
  await filterButton(page).click();
  await expect(filterAndSort(page)).toBeVisible();

  const slides = await filterAndSort(page).evaluate((dialog) =>
    dialog
      .getAnimations()
      .map(
        (animation) =>
          animation instanceof CSSTransition && animation.transitionProperty,
      ),
  );

  expect(slides).toContain("translate");

  await page.keyboard.press("Escape");
  await expect(filterAndSort(page)).toBeHidden();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await filterButton(page).click();
  await expect(filterAndSort(page)).toBeVisible();
  expect(
    await filterAndSort(page).evaluate(
      (dialog) => dialog.getAnimations().length,
    ),
  ).toBe(0);
});

test("lists the filter in use as a chip under the library, and takes it off with its cross", async ({
  page,
}) => {
  storedListing = {
    ...NEW_LIBRARY_LISTING,
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "any",
      started: "hide",
      finished: "any",
    },
  };
  await openLibrary(page);
  const inUse = page.getByRole("list", { name: "Filters in use" });

  await expect(inUse.getByRole("listitem")).toHaveText(["Unread"]);
  await inUse.getByRole("button", { name: "Remove Unread" }).click();

  await expectTitles(page, [1, 2, 3, 4, 5, 6]);
  await expect(inUse).toHaveCount(0);
});

test("clears every filter in use with Clear all", async ({ page }) => {
  storedListing = {
    ...NEW_LIBRARY_LISTING,
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      unread: "any",
      started: "any",
      finished: "only",
    },
  };
  await openLibrary(page);

  await page.getByRole("button", { name: "Clear all" }).click();

  await expectTitles(page, [1, 2, 3, 4, 5, 6]);
  await expect
    .poll(() => storedListing.filter)
    .toEqual(NEW_LIBRARY_LISTING.filter);
});

for (const platform of ["android", "ios"] as const) {
  test.describe(`on ${platform}`, () => {
    test.use({
      backend: {
        ...FILTERING_BACKEND,
        appInfo: () => fakeAppInfo(platform),
      },
    });

    test("sizes Sort by and its direction for a finger", async ({ page }) => {
      await openLibrary(page);
      await filterButton(page).click();
      const panel = page.getByRole("dialog", { name: "Sort and filter" });
      await settle(panel);

      const select = await boxOf(
        panel.getByRole("combobox", { name: "Sort by" }),
      );
      const direction = await boxOf(
        panel.getByRole("button", { name: "Order: A to Z. Change to Z to A" }),
      );

      expect(select.height).toBeGreaterThanOrEqual(TOUCH_TARGET);
      expect([direction.width, direction.height]).toEqual([
        TOUCH_TARGET,
        TOUCH_TARGET,
      ]);
    });
  });
}

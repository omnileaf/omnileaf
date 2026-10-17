import type { Locator, Page } from "@playwright/test";

import type {
  LibraryFilter,
  LibraryFilterChoices,
  LibraryListing,
  SeriesFormat,
  SmartFilter,
} from "../../src/lib/ipc/bindings.ts";
import { NEW_LIBRARY_LISTING } from "../../src/lib/library/library-listing.ts";
import type { FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  screenSizeOf,
  settle,
  test,
} from "./fixtures.ts";
import { sampleSeries, type WireSeries } from "./series-catalog.ts";

interface FakeSeries {
  readonly series: WireSeries;
  readonly format: SeriesFormat;
  readonly tags: readonly string[];
  readonly isAdult: boolean;
  readonly smart?: readonly SmartFilter[];
}

const DETAILS: readonly Omit<FakeSeries, "series">[] = [
  {
    format: "manga",
    tags: ["Seinen", "Sea"],
    isAdult: false,
    smart: ["quickReads"],
  },
  {
    format: "comic",
    tags: ["Slice of life"],
    isAdult: false,
    smart: ["quickReads", "forgotten"],
  },
  { format: "book", tags: ["Letters"], isAdult: true },
  { format: "manga", tags: [], isAdult: false },
];
const LANGUAGES = ["ja", "en", "ja", "fr"];
const CATALOG: readonly FakeSeries[] = sampleSeries(DETAILS.length).map(
  (series, index) => ({
    ...(DETAILS[index] ?? { format: "manga", tags: [], isAdult: false }),
    series: { ...series, language: LANGUAGES[index] ?? null },
  }),
);
const CHOICES: LibraryFilterChoices = {
  formats: ["comic", "manga", "book"],
  languages: ["ja", "en", "fr"],
  tags: ["Slice of life", "Seinen", "Sea", "Letters"],
  ratesAdult: true,
  keepsBookmarks: true,
  smart: ["quickReads", "forgotten", "duplicates"],
};

function isOneOf<T>(chosen: readonly T[], value: T | null): boolean {
  return chosen.length === 0 || (value !== null && chosen.includes(value));
}

function letThrough(filter: LibraryFilter): WireSeries[] {
  return CATALOG.filter(
    ({ series, format, tags, isAdult, smart }) =>
      isOneOf(filter.formats, format) &&
      isOneOf(filter.languages, series.language) &&
      (filter.tags.length === 0 ||
        tags.some((tag) => filter.tags.includes(tag))) &&
      (filter.adult === "any" || (filter.adult === "only") === isAdult) &&
      filter.smart.every((chosen) => (smart ?? []).includes(chosen)),
  ).map(({ series }) => series);
}

let storedListing: LibraryListing = NEW_LIBRARY_LISTING;

const CHOOSING_BACKEND = {
  ...DEFAULT_BACKEND,
  librarySeries: (_after, listing) => ({
    series: letThrough(listing.filter),
    next: null,
  }),
  librarySeriesCount: (filter) => letThrough(filter).length,
  libraryFilterChoices: () => CHOICES,
  libraryListing: () => storedListing,
  setLibraryListing: (listing) => {
    storedListing = listing;
    return null;
  },
} satisfies FakeBackend;

test.use({ backend: CHOOSING_BACKEND });

test.beforeEach(() => {
  storedListing = NEW_LIBRARY_LISTING;
});

function panelOf(page: Page): Locator {
  return page.getByRole(
    screenSizeOf(page) === "desktop" ? "complementary" : "dialog",
    { name: "Sort and filter" },
  );
}

function seriesList(page: Page): Locator {
  return page.getByRole("list", { name: "Series" });
}

function row(page: Page, name: string): Locator {
  return panelOf(page).getByRole("group", { name, exact: true });
}

async function openPanel(page: Page): Promise<Locator> {
  await page.goto("/");
  await expect(seriesList(page).getByRole("listitem").first()).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("button", { name: /^Sort and filter/ })
    .click();
  await expect(panelOf(page)).toBeVisible();
  await settle(panelOf(page));
  return panelOf(page);
}

async function closePanel(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(panelOf(page)).toBeHidden();
}

async function expectListed(page: Page, numbers: readonly number[]) {
  await expect(seriesList(page).getByRole("listitem")).toHaveText(
    numbers.map(
      (number) =>
        new RegExp(`Sample Series ${String(number).padStart(4, "0")}`),
    ),
  );
}

test("lists only the series of the formats chosen, and chips each one", async ({
  page,
}) => {
  await openPanel(page);
  const manga = row(page, "Format").getByRole("button", { name: "Manga" });

  await manga.click();

  await expect(manga).toHaveAttribute("aria-pressed", "true");
  await expectListed(page, [1, 4]);
  await expect.poll(() => storedListing.filter.formats).toEqual(["manga"]);
  await closePanel(page);
  await expect(
    page.getByRole("list", { name: "Filters in use" }).getByRole("listitem"),
  ).toHaveText(["Manga"]);
});

test("names each language in the interface's language", async ({ page }) => {
  await openPanel(page);

  await expect(row(page, "Language").getByRole("button")).toHaveText([
    "Japanese",
    "English",
    "French",
  ]);
  await row(page, "Language").getByRole("button", { name: "Japanese" }).click();

  await expectListed(page, [1, 3]);
});

test("offers the first three tags, and the rest on More tags", async ({
  page,
}) => {
  await openPanel(page);
  const tags = row(page, "Tags");
  await expect(tags.locator("[aria-pressed]")).toHaveText([
    "Slice of life",
    "Seinen",
    "Sea",
  ]);

  await tags.getByRole("button", { name: "More tags" }).click();

  await expect(tags.getByRole("button", { name: "Letters" })).toBeVisible();
  await expect(tags.getByRole("button", { name: "More tags" })).toHaveCount(0);
});

test("hides the adult series once 18+ is set to Hide, and chips it as No 18+", async ({
  page,
}) => {
  await openPanel(page);

  await row(page, "18+")
    .getByRole("radio", { name: "Hide", exact: true })
    .click();

  await expectListed(page, [1, 2, 4]);
  await closePanel(page);
  await expect(
    page.getByRole("list", { name: "Filters in use" }).getByRole("listitem"),
  ).toHaveText(["No 18+"]);
});

test("lists only the series meeting every smart filter turned on, and chips each one", async ({
  page,
}) => {
  const panel = await openPanel(page);

  await panel.getByRole("switch", { name: "Quick reads" }).click();
  await expectListed(page, [1, 2]);
  await panel.getByRole("switch", { name: "Forgotten" }).click();

  await expectListed(page, [2]);
  await closePanel(page);
  await expect(
    page.getByRole("list", { name: "Filters in use" }).getByRole("listitem"),
  ).toHaveText(["Quick reads", "Forgotten"]);
});

test("says Ready to clean up waits for downloads while the library has none", async ({
  page,
}) => {
  const panel = await openPanel(page);

  await expect(
    panel.getByText(
      "Ready to clean up (downloaded and finished) appears once you have downloads.",
    ),
  ).toBeVisible();
  await expect(
    panel.getByRole("switch", { name: "Ready to clean up" }),
  ).toHaveCount(0);
});

test("names the filters that together leave nothing, says the library hasn't changed, and counts no series", async ({
  page,
}) => {
  storedListing = {
    ...NEW_LIBRARY_LISTING,
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      formats: ["book"],
      languages: ["fr"],
    },
  };
  await page.goto("/");
  const noMatches = page.getByRole("region", {
    name: "No series match these filters",
  });

  await expect(noMatches).toContainText(
    "Books and French together leave nothing. Your library hasn't changed.",
  );
  await expect(
    page.getByRole("main").getByText("No series", { exact: true }),
  ).toBeVisible();
  await noMatches.getByRole("button", { name: "Clear all filters" }).click();

  await expectListed(page, [1, 2, 3, 4]);
});

test("says when one filter alone leaves nothing", async ({ page }) => {
  storedListing = {
    ...NEW_LIBRARY_LISTING,
    filter: { ...NEW_LIBRARY_LISTING.filter, languages: ["de"] },
  };
  await page.goto("/");

  await expect(
    page.getByRole("region", { name: "No series match these filters" }),
  ).toContainText("German leaves nothing. Your library hasn't changed.");
});

test("counts each format, language and tag chosen on the Filter button", async ({
  page,
}) => {
  storedListing = {
    ...NEW_LIBRARY_LISTING,
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      formats: ["manga"],
      languages: ["ja", "fr"],
    },
  };

  await page.goto("/");

  await expect(
    page.getByRole("main").getByRole("button", { name: /^Sort and filter/ }),
  ).toHaveAccessibleName("Sort and filter, 3 filters on");
});

test("the filter rows have no accessibility violations", async ({ page }) => {
  storedListing = {
    ...NEW_LIBRARY_LISTING,
    filter: { ...NEW_LIBRARY_LISTING.filter, languages: ["ja"] },
  };
  await openPanel(page);

  const violations = await accessibilityViolations(page);

  expect(violations).toEqual([]);
});

test.describe("while the library knows no formats, languages, tags, ratings or bookmarks", () => {
  test.use({
    backend: {
      ...CHOOSING_BACKEND,
      libraryFilterChoices: DEFAULT_BACKEND.libraryFilterChoices,
    },
  });

  test("offers the read state alone", async ({ page }) => {
    const panel = await openPanel(page);

    await expect(row(page, "Read state")).toBeVisible();
    await expect(panel.getByText("Smart filters")).toHaveCount(0);
    for (const name of ["Format", "Language", "Tags", "18+", "Bookmarked"]) {
      await expect(panel.getByRole("group", { name, exact: true })).toHaveCount(
        0,
      );
    }
  });
});

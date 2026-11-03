import type {
  LibraryFilter,
  LibraryListing,
} from "../../src/lib/ipc/bindings.ts";
import { NEW_LIBRARY_LISTING } from "../../src/lib/library/library-listing.ts";
import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

const LIBRARY = sampleSeries(4);
const TAGGED = new Set([LIBRARY[0]?.id, LIBRARY[2]?.id]);
const shelf = new FakeShelf([{ state: "notStarted" }], {
  tags: ["Seinen", "Sea"],
});

let stored: LibraryListing = NEW_LIBRARY_LISTING;
let asked: LibraryFilter[] = [];

const BACKEND: FakeBackend = {
  ...DEFAULT_BACKEND,
  seriesOverview: (id) => shelf.backend().seriesOverview(id),
  seriesBooks: (id, listing, after) =>
    shelf.backend().seriesBooks(id, listing, after),
  librarySeries: (_after, listing) => {
    asked.push(listing.filter);
    const wanted = listing.filter.tags;
    return {
      series: LIBRARY.filter(
        (one) => wanted.length === 0 || TAGGED.has(one.id),
      ),
      next: null,
    };
  },
  librarySeriesCount: () => LIBRARY.length,
  libraryListing: () => stored,
  setLibraryListing: (listing) => {
    stored = listing;
    return null;
  },
};

test.use({ backend: BACKEND });

test.beforeEach(() => {
  stored = NEW_LIBRARY_LISTING;
  asked = [];
});

test("opens the library showing only the series with the tag a chip names", async ({
  page,
}) => {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SERIES_TITLE }),
  ).toBeVisible();

  await page
    .getByRole("list", { name: "Tags" })
    .getByRole("link", { name: "Seinen" })
    .click();

  await expect(page).toHaveURL(/\/(\?.*)?$/u);
  const covers = page.getByRole("list", { name: "Series" });
  await expect(covers.getByRole("listitem")).toHaveCount(TAGGED.size);
  expect(asked.at(-1)?.tags).toEqual(["Seinen"]);
});

test("replaces the filters already chosen instead of adding to them", async ({
  page,
}) => {
  stored = {
    ...NEW_LIBRARY_LISTING,
    filter: {
      ...NEW_LIBRARY_LISTING.filter,
      tags: ["Sea"],
      formats: ["comic"],
    },
  };
  await page.goto(`/series/${SERIES_ID}`);

  await page
    .getByRole("list", { name: "Tags" })
    .getByRole("link", { name: "Seinen" })
    .click();

  await expect
    .poll(() => asked.at(-1))
    .toMatchObject({ tags: ["Seinen"], formats: [] });
});

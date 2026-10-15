import { expect, test } from "vitest";

import { type LibraryListing } from "#lib/ipc/bindings.ts";
import { CommandFailure } from "#lib/ipc/fake-backend.ts";

import { sampleBackend, scenarioFrom } from "./sample-backend.ts";
import { LONG_TITLE, sampleBookId, sampleSeriesId } from "./sample-library.ts";
import { NEW_LIBRARY_LISTING } from "#lib/library/library-listing.ts";

const NEWEST_FIRST: LibraryListing = {
  ...NEW_LIBRARY_LISTING,
  sort: { by: "dateAdded", direction: "descending" },
};

function backendFor(search = "") {
  const emitted: string[] = [];
  const backend = sampleBackend(scenarioFrom(new URLSearchParams(search)), {
    emit: (event) => emitted.push(event),
  });
  return { backend, emitted };
}

test("lists the library as the boards draw it, newest first", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySeries(null, NEWEST_FIRST);

  expect(page.series.slice(0, 5).map((series) => series.title)).toEqual([
    "Sample Series 01",
    "Sample Series 04",
    "Sample Series 02",
    LONG_TITLE,
    "Sample Series 03",
  ]);
});

test("counts each series' books not yet read", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySeries(null, NEWEST_FIRST);

  expect(
    page.series.find((series) => series.title === "Sample Series 04")
      ?.unreadCount,
  ).toBe(6);
});

test("pages through every series with a cursor", async () => {
  const { backend } = backendFor();
  const titles: string[] = [];

  let next: string | null = null;
  do {
    const page = await backend.librarySeries(next, NEW_LIBRARY_LISTING);
    titles.push(...page.series.map((series) => series.title));
    next = page.next;
  } while (next !== null);

  expect(titles).toHaveLength(19);
  expect(await backend.librarySeriesCount(NEW_LIBRARY_LISTING.filter)).toBe(19);
});

test("lists only series with every book read when asked for finished ones", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySeries(null, {
    ...NEW_LIBRARY_LISTING,
    filter: { ...NEW_LIBRARY_LISTING.filter, finished: "only" },
  });

  expect(page.series.map((series) => series.title)).toEqual([
    "Sample Series 02",
    "Sample Series 05",
    "Sample Series 09",
    "Sample Series 15",
    "Sample Series 17",
  ]);
});

test("opens Volume 3 of Sample Series 04 on its saved page beside its neighbours", async () => {
  const { backend } = backendFor();

  const opened = await backend.openBook(sampleBookId(4, 3), []);

  expect(opened.title).toBe("Volume 3");
  expect(opened.pages).toHaveLength(192);
  expect(opened.startPage).toBe(13);
  expect(opened.previous?.title).toBe("Volume 2");
  expect(opened.next?.title).toBe("Volume 4");
});

test("keeps the page last shown, so the series carries on from it", async () => {
  const { backend, emitted } = backendFor();

  await backend.pageShown(sampleBookId(4, 3), 40, 0);
  const overview = await backend.seriesOverview(sampleSeriesId(4));

  expect(overview.upNext?.reading).toEqual({ state: "started", page: 40 });
  expect(emitted).toContain("reading-saved");
});

test("marks books read and says the library changed", async () => {
  const { backend, emitted } = backendFor();

  await backend.markBooks([sampleBookId(4, 3), sampleBookId(4, 4)], "read");
  const overview = await backend.seriesOverview(sampleSeriesId(4));

  expect(overview.readCount).toBe(4);
  expect(emitted).toContain("library-changed");
});

test("shows an empty library when asked for one", async () => {
  const { backend } = backendFor("library=empty");

  const page = await backend.librarySeries(null, NEW_LIBRARY_LISTING);

  expect(page.series).toEqual([]);
});

test("fails to load the library when asked to", async () => {
  const { backend } = backendFor("library=failed");

  const listing = backend.librarySeries(null, NEW_LIBRARY_LISTING);

  await expect(listing).rejects.toBeInstanceOf(CommandFailure);
});

test("can't open a book whose file is missing", async () => {
  const { backend } = backendFor("volume6=missing");

  const opening = (async () => backend.openBook(sampleBookId(4, 6), []))();

  await expect(opening).rejects.toBeInstanceOf(CommandFailure);
});

test("answers on the platform asked for", async () => {
  const { backend } = backendFor("platform=ios");

  const info = await backend.appInfo();

  expect(info.platform).toBe("ios");
});

test("shows a series with its books gone when asked to", async () => {
  const { backend } = backendFor("?series=empty");
  const series = sampleSeriesId(4);

  const overview = await backend.seriesOverview(series);
  const books = await backend.seriesBooks(
    series,
    { shown: "all", direction: "ascending" },
    null,
  );

  expect([overview.bookCount, overview.upNext, books.books]).toEqual([
    0,
    null,
    [],
  ]);
});

test("relates Sample Series 04 to the series the boards draw beside it", async () => {
  const { backend } = backendFor();

  const overview = await backend.seriesOverview(sampleSeriesId(4));

  expect(
    overview.related.map(({ title, reason, readCount, bookCount }) => [
      title,
      reason,
      readCount,
      bookCount,
    ]),
  ).toEqual([
    ["Sample Series 07", { kind: "sameWriter" }, 3, 5],
    ["Sample Series 06", { kind: "sharedTag", tag: "Slice of life" }, 7, 9],
    ["Sample Series 01", { kind: "sameWriter" }, 9, 12],
  ]);
});

test("lists a creator's series with their role on each", async () => {
  const { backend } = backendFor();

  const found = await backend.creatorSeries("Author A");

  expect(found.slice(0, 3).map(({ title, role }) => [title, role])).toEqual([
    ["Sample Series 01", "storyAndArt"],
    ["Sample Series 04", "storyAndArt"],
    [LONG_TITLE, "story"],
  ]);
});

test("counts the series that name each creator", async () => {
  const { backend } = backendFor();

  const overview = await backend.seriesOverview(sampleSeriesId(19));

  expect(
    overview.creators.map(({ name, seriesCount }) => [name, seriesCount]),
  ).toEqual([
    ["Author A", 5],
    ["Author B", 1],
    ["Author C", 1],
    ["Author D", 1],
  ]);
});

test("keeps the boards' categories, each listing only its own series", async () => {
  const { backend } = backendFor();

  const categories = await backend.libraryCategories();
  const sea = await backend.categorySeries(
    "sea-stories",
    null,
    NEW_LIBRARY_LISTING,
  );

  expect(categories.map(({ name }) => name)).toEqual([
    "Reading",
    "Manga",
    "Comics",
    "Plan to read",
    "Favourites",
    "Seinen",
    "Sea stories",
  ]);
  expect(sea.series.length).toBeGreaterThan(0);
  expect(
    await backend.categorySeriesCount(
      "sea-stories",
      NEW_LIBRARY_LISTING.filter,
    ),
  ).toBe(sea.series.length);
});

test("keeps no categories in an empty library", async () => {
  const { backend } = backendFor("library=empty");

  expect(await backend.libraryCategories()).toEqual([]);
});

function filtered(filter: Partial<LibraryListing["filter"]>): LibraryListing {
  return {
    ...NEW_LIBRARY_LISTING,
    filter: { ...NEW_LIBRARY_LISTING.filter, ...filter },
  };
}

async function titlesFor(filter: Partial<LibraryListing["filter"]>) {
  const { backend } = backendFor();
  const page = await backend.librarySeries(null, filtered(filter));
  return page.series.map((series) => series.title);
}

test("offers the formats, languages and tags the sample library holds, with ratings and bookmarks", async () => {
  const { backend } = backendFor();

  const choices = await backend.libraryFilterChoices();

  expect(choices).toEqual({
    formats: ["comic", "manga", "book"],
    languages: ["ja", "en", "fr", "de"],
    tags: ["Slice of life", "Seinen", "Sea", "Letters"],
    ratesAdult: true,
    keepsBookmarks: true,
    smart: ["quickReads", "forgotten", "duplicates", "readyToCleanUp"],
  });
});

test("lists only the series of a format chosen", async () => {
  expect(await titlesFor({ formats: ["book"] })).toEqual([LONG_TITLE]);
});

test("lists only the series in one of the languages chosen", async () => {
  const titles = await titlesFor({ languages: ["fr", "de"] });

  expect(titles).toEqual([
    "Sample Series 03",
    "Sample Series 06",
    "Sample Series 10",
    "Sample Series 13",
    "Sample Series 17",
  ]);
});

test("lists only the series carrying one of the tags chosen", async () => {
  expect(await titlesFor({ tags: ["Seinen"] })).toEqual(["Sample Series 04"]);
});

test("leaves out the adult series once 18+ is hidden, and lists only them once it is the only one", async () => {
  const hidden = await titlesFor({ adult: "hide" });
  const only = await titlesFor({ adult: "only" });

  expect(only).toEqual(["Sample Series 13", "Sample Series 17"]);
  expect(hidden).not.toContain("Sample Series 13");
  expect(hidden).toHaveLength(17);
});

test("lists only the series with a bookmarked page once Bookmarked is the only one", async () => {
  const { backend } = backendFor();
  const book = sampleBookId(6, 2);
  await backend.bookmarkPages(book, [3], true);

  const page = await backend.librarySeries(
    null,
    filtered({ bookmarked: "only" }),
  );

  expect(page.series.map((series) => series.title)).toEqual([
    "Sample Series 06",
  ]);
});

test("lists the quick reads, and only the series meeting every smart filter on", async () => {
  expect(await titlesFor({ smart: ["quickReads"] })).toEqual([
    "Sample Series 04",
    "Sample Series 07",
    "Sample Series 16",
    "Sample Series 18",
  ]);
  expect(await titlesFor({ smart: ["quickReads", "forgotten"] })).toEqual([]);
});

test("lists the series downloaded and finished as ready to clean up", async () => {
  expect(await titlesFor({ smart: ["readyToCleanUp"] })).toEqual([
    "Sample Series 15",
  ]);
});

import { expect, test } from "vitest";

import { type LibraryFilter, type LibraryListing } from "#lib/ipc/bindings.ts";
import { CommandFailure, type FakeBackend } from "#lib/ipc/fake-backend.ts";

import { sampleBackend, scenarioFrom } from "./sample-backend.ts";
import {
  LONG_TITLE,
  STRIP_CHAPTER_PAGES,
  STRIP_CHAPTERS,
  STRIP_SERIES_NUMBER,
  sampleBookId,
  sampleSeriesId,
} from "./sample-library.ts";
import { NEW_LIBRARY_LISTING } from "#lib/library/library-listing.ts";
import { NEW_LIBRARY_TABS } from "#lib/library/library-tabs.ts";

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

type RemovalTarget = Parameters<FakeBackend["removeFromLibrary"]>[0][number];

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

  expect(titles).toHaveLength(21);
  expect(await backend.librarySeriesCount(NEW_LIBRARY_LISTING.filter)).toBe(21);
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

test("says the library changed when screenshot mode turns on or off, and not when it stays as it is", async () => {
  const { backend, emitted } = backendFor();

  await backend.setScreenshotMode(false);
  const staying = emitted.filter((event) => event === "library-changed");
  await backend.setScreenshotMode(true);
  await backend.setScreenshotMode(true);
  await backend.setScreenshotMode(false);

  expect([
    staying.length,
    emitted.filter((event) => event === "library-changed").length,
  ]).toEqual([0, 2]);
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

test("names a book's file after its title", async () => {
  const { backend } = backendFor();

  const file = await backend.bookFile(sampleBookId(4, 3));

  expect(file).toEqual({ name: "Volume 3.cbz", fileType: "cbz" });
});

test("names no file for a book the library doesn't hold", async () => {
  const { backend } = backendFor();

  const file = await backend.bookFile(sampleBookId(4, 99));

  expect(file).toBeNull();
});

test("hides no file types to begin with", async () => {
  const { backend } = backendFor();

  const hidden = await backend.hiddenFileTypes();

  expect(hidden).toEqual([]);
});

test("can't open Volume 6 when its file is of a type this version doesn't read", async () => {
  const { backend } = backendFor("volume6=unsupported");

  const opening = (async () => backend.openBook(sampleBookId(4, 6), []))();

  await expect(opening).rejects.toMatchObject({
    error: { code: "bookTypeUnsupported" },
  });
});

test("names Volume 6's file as a CBR file when this version can't read it", async () => {
  const { backend } = backendFor("volume6=unsupported");

  const file = await backend.bookFile(sampleBookId(4, 6));

  expect(file).toEqual({ name: "Volume 6.cbr", fileType: "cbr" });
});

test("hides files like Volume 6's until their type is shown again", async () => {
  const { backend } = backendFor("volume6=unsupported");

  const hidden = await backend.hideFilesLike(sampleBookId(4, 6));
  const listed = await backend.hiddenFileTypes();
  await backend.showFileType("cbr");

  expect(hidden).toBe("cbr");
  expect(listed).toEqual(["cbr"]);
  expect(await backend.hiddenFileTypes()).toEqual([]);
});

test("lists the file types hidden in order", async () => {
  const { backend } = backendFor("volume6=unsupported");

  await backend.hideFileType("rar");
  await backend.hideFilesLike(sampleBookId(4, 6));

  expect(await backend.hiddenFileTypes()).toEqual(["cbr", "rar"]);
});

test("refuses to hide a file type this version reads", async () => {
  const { backend } = backendFor();

  const hiding = (async () => backend.hideFileType("cbz"))();

  await expect(hiding).rejects.toMatchObject({
    error: { code: "fileTypeRead" },
  });
});

test("names the file types a rescan skipped when asked to", async () => {
  const { backend } = backendFor("skipped=types");

  const rescan = await backend.rescanLibraryFolder("folder", {
    send: () => Promise.resolve(),
  });

  expect(
    rescan.skippedTypes?.map(({ fileType, files }) => [fileType, files]),
  ).toEqual([
    ["cbr", 3],
    ["rar", 1],
  ]);
  expect(rescan.outcome).toMatchObject({ unsupportedBooks: 4 });
});

test("adds a folder holding only files of types it skips when asked to", async () => {
  const { backend } = backendFor("skipped=types");

  const scan = await backend.addLibraryFolder({
    send: () => Promise.resolve(),
  });

  expect(scan).toMatchObject({ books: 0, unsupportedBooks: 4 });
  expect(scan?.skippedTypes?.map(({ fileType }) => fileType)).toEqual([
    "cbr",
    "rar",
  ]);
});

test("answers on the platform asked for", async () => {
  const { backend } = backendFor("platform=ios");

  const info = await backend.appInfo();

  expect(info.platform).toBe("ios");
});

test("draws the window solid on every platform unless asked for Mica", async () => {
  const backdrops = await Promise.all(
    [
      "platform=windows",
      "platform=macos",
      "platform=windows&backdrop=mica",
    ].map(
      async (search) =>
        (await backendFor(search).backend.appInfo()).windowBackdrop,
    ),
  );

  expect(backdrops).toEqual(["none", "none", "mica"]);
});

test("reports a problem with the platform's system and a log in stand-ins", async () => {
  const { backend } = backendFor("platform=ios");

  const report = await backend.problemReport();

  expect(report.system).toBe("iOS 26");
  expect(report.log.join("\n")).not.toContain("Sample Series");
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

test("numbers each book from its title, as a volume or a chapter", async () => {
  const { backend } = backendFor();
  const firstOf = async (series: number) =>
    (
      await backend.seriesBooks(
        sampleSeriesId(series),
        { shown: "all", direction: "ascending" },
        null,
      )
    ).books[0];

  const books = [await firstOf(4), await firstOf(11)];

  expect(
    books.map((book) => [
      book?.kind,
      book?.numbers,
      book?.volume,
      book?.section,
    ]),
  ).toEqual([
    ["volume", { first: 1, last: 1 }, null, "volumes"],
    ["chapter", { first: 1, last: 1 }, null, "chapters"],
  ]);
});

test("lists only the books of the section asked for", async () => {
  const { backend } = backendFor();
  const listed = async (section: "volumes" | "chapters") =>
    (
      await backend.seriesBooks(
        sampleSeriesId(4),
        { shown: "all", direction: "ascending", section },
        null,
      )
    ).books.length;

  const counts = [await listed("volumes"), await listed("chapters")];

  expect(counts).toEqual([8, 0]);
});

test("sums up each series by its year, the books in each section, the volumes it misses and its last volume", async () => {
  const { backend } = backendFor();
  const summed = async (series: number) => {
    const overview = await backend.seriesOverview(sampleSeriesId(series));
    return [
      overview.year,
      overview.sections,
      overview.missingVolumes,
      overview.lastVolume,
    ];
  };

  const overviews = [await summed(4), await summed(11)];

  expect(overviews).toEqual([
    [2008, [{ section: "volumes", bookCount: 8 }], [], 8],
    [2015, [{ section: "chapters", bookCount: 154 }], [], null],
  ]);
});

test("lists each series book with its own cover, and none for a book whose file is missing", async () => {
  const { backend } = backendFor();

  const { books } = await backend.seriesBooks(
    sampleSeriesId(4),
    { shown: "all", direction: "ascending" },
    null,
  );

  expect(books.map((book) => book.cover)).toEqual([
    "covers/4-2-1",
    "covers/4-2-2",
    "covers/4-2-3",
    "covers/4-2-4",
    "covers/4-2-5",
    null,
    "covers/4-2-7",
    "covers/4-2-8",
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
    "Sample Series 20",
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
  expect(hidden).toHaveLength(19);
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

const STRIP_LAST_CHAPTER = STRIP_CHAPTERS;
const STRIP_CHAPTERS_RESET = [
  STRIP_LAST_CHAPTER - 3,
  STRIP_LAST_CHAPTER - 2,
  STRIP_LAST_CHAPTER - 1,
] as const;
const STRIP_RESET_PAGE = 1;
const STRIP_TITLE = "Sample Series 20";

async function leaveStripPagesLeft(backend: FakeBackend, pagesLeft: number) {
  for (const chapter of STRIP_CHAPTERS_RESET) {
    await backend.pageShown(
      sampleBookId(STRIP_SERIES_NUMBER, chapter),
      STRIP_RESET_PAGE,
      0,
    );
  }
  const leftOutsideLast =
    STRIP_CHAPTERS_RESET.length * (STRIP_CHAPTER_PAGES - STRIP_RESET_PAGE);
  await backend.pageShown(
    sampleBookId(STRIP_SERIES_NUMBER, STRIP_LAST_CHAPTER),
    STRIP_CHAPTER_PAGES - (pagesLeft - leftOutsideLast),
    0,
  );
}

async function quickReadTitles(backend: FakeBackend) {
  const page = await backend.librarySeries(
    null,
    filtered({ smart: ["quickReads"] }),
  );
  return page.series.map((series) => series.title);
}

test("lists the series with under 30 minutes left at nine seconds a page as quick reads", async () => {
  expect(await titlesFor({ smart: ["quickReads"] })).toEqual([
    "Sample Series 11",
    "Sample Series 20",
    "Sample Series 21",
  ]);
});

test("lists no series that is both a quick read and forgotten while none is", async () => {
  expect(await titlesFor({ smart: ["quickReads", "forgotten"] })).toEqual([]);
});

const FORGOTTEN_NUMBER = 9;
const FORGOTTEN_TITLE = "Sample Series 09";

test("lists only the series that are quick reads and forgotten together once a forgotten series has under 30 minutes left", async () => {
  const { backend } = backendFor();
  await backend.markBooks([sampleBookId(FORGOTTEN_NUMBER, 1)], "unread");

  const both = await backend.librarySeries(
    null,
    filtered({ smart: ["quickReads", "forgotten"] }),
  );

  expect(both.series.map((series) => series.title)).toEqual([FORGOTTEN_TITLE]);
});

test("lists a series with 199 pages left as a quick read, as 199 pages take 1,791 seconds", async () => {
  const { backend } = backendFor();

  await leaveStripPagesLeft(backend, 199);

  expect(await quickReadTitles(backend)).toContain(STRIP_TITLE);
});

test("leaves out a series with 200 pages left, as 200 pages take 1,800 seconds", async () => {
  const { backend } = backendFor();

  await leaveStripPagesLeft(backend, 200);

  expect(await quickReadTitles(backend)).not.toContain(STRIP_TITLE);
});

test("leaves a series out of the quick reads once it is finished", async () => {
  const { backend } = backendFor();

  await backend.markSeriesRead([sampleSeriesId(STRIP_SERIES_NUMBER)]);

  expect(await quickReadTitles(backend)).toEqual([
    "Sample Series 11",
    "Sample Series 21",
  ]);
});

test("lists the series downloaded and finished as ready to clean up", async () => {
  expect(await titlesFor({ smart: ["readyToCleanUp"] })).toEqual([
    "Sample Series 15",
  ]);
});

test("marks the series chosen read, and puts every book back as it was once those books are marked unread", async () => {
  const { backend } = backendFor();
  const before = await backend.librarySeries(null, NEW_LIBRARY_LISTING);
  const chosen = before.series
    .filter((series) => series.unreadCount > 0)
    .slice(0, 2);

  const marked = await backend.markSeriesRead(chosen.map(({ id }) => id));
  const read = await backend.librarySeries(null, NEW_LIBRARY_LISTING);
  await backend.markBooks(marked, "unread");
  const after = await backend.librarySeries(null, NEW_LIBRARY_LISTING);

  expect(marked).toHaveLength(
    chosen.reduce((sum, series) => sum + series.unreadCount, 0),
  );
  expect(
    read.series
      .filter((series) => chosen.some(({ id }) => id === series.id))
      .map((series) => series.unreadCount),
  ).toEqual([0, 0]);
  expect(after.series).toEqual(before.series);
});

test("names how many of the series asked about are in each category and carry each tag", async () => {
  const { backend } = backendFor();
  const series = [sampleSeriesId(4), sampleSeriesId(19)];

  const labels = await backend.seriesLabels(series);

  expect(labels.keepsLabels).toBe(true);
  expect(
    labels.categories
      .filter(({ holding }) => holding > 0)
      .map(({ category, holding }) => [category.name, holding]),
  ).toEqual([
    ["Reading", 2],
    ["Manga", 1],
    ["Favourites", 2],
    ["Seinen", 1],
    ["Sea stories", 2],
  ]);
  expect(labels.tags.map(({ tag, holding }) => [tag, holding])).toEqual([
    ["Slice of life", 2],
    ["Seinen", 1],
    ["Sea", 2],
    ["Letters", 2],
  ]);
});

test("puts the series in a category and a new one, tags them, and takes a tag off", async () => {
  const { backend } = backendFor();
  const series = [sampleSeriesId(2), sampleSeriesId(5)];

  await backend.labelSeries(series, {
    categoriesAdded: ["favourites"],
    categoriesRemoved: [],
    categoriesCreated: ["Holiday reads"],
    tagsAdded: ["Letters"],
    tagsRemoved: [],
  });
  await backend.labelSeries([sampleSeriesId(5)], {
    categoriesAdded: [],
    categoriesRemoved: [],
    categoriesCreated: [],
    tagsAdded: [],
    tagsRemoved: ["Letters"],
  });
  const labels = await backend.seriesLabels(series);

  expect(
    labels.categories
      .filter(({ category }) =>
        ["Favourites", "Holiday reads"].includes(category.name),
      )
      .map(({ category, holding }) => [category.name, holding]),
  ).toEqual([
    ["Favourites", 2],
    ["Holiday reads", 2],
  ]);
  expect(labels.tags.map(({ tag, holding }) => [tag, holding])).toEqual([
    ["Letters", 1],
  ]);
  expect((await backend.libraryCategories()).map(({ name }) => name)).toContain(
    "Holiday reads",
  );
});

test("marks the series rated 18+ as adult while age ratings count, and none once they don't", async () => {
  const { backend } = backendFor();
  const adultTitles = async () =>
    (await backend.librarySeries(null, NEWEST_FIRST)).series
      .filter((series) => series.isAdult)
      .map((series) => series.title);

  const rated = await adultTitles();
  await backend.setLibraryAdultContent({
    treatment: "show",
    countsAgeRatings: false,
  });

  expect([rated, await adultTitles()]).toEqual([
    ["Sample Series 13", "Sample Series 17"],
    [],
  ]);
});

test("leaves adult series out of the list, its count and search once they're hidden", async () => {
  const { backend } = backendFor();
  await backend.setLibraryAdultContent({
    treatment: "hide",
    countsAgeRatings: true,
  });

  const page = await backend.librarySeries(null, NEWEST_FIRST);
  const found = await backend.librarySearch(null, {
    text: "Sample Series 1",
    filter: NEWEST_FIRST.filter,
  });

  expect(page.series.map((series) => series.title)).not.toContain(
    "Sample Series 13",
  );
  expect(await backend.librarySeriesCount(NEWEST_FIRST.filter)).toBe(19);
  expect(found.series.map((series) => series.title)).not.toContain(
    "Sample Series 17",
  );
});

const ADULT_TITLES = ["Sample Series 13", "Sample Series 17"];

async function listedTitles(backend: ReturnType<typeof backendFor>["backend"]) {
  const page = await backend.librarySeries(null, NEWEST_FIRST);
  return page.series.map((series) => series.title);
}

test("leaves the adult series out of every list and count while screenshot mode is on, and brings them back once it's off", async () => {
  const { backend } = backendFor();
  const everything = { kind: "everything" } as const;
  const before = {
    listed: await listedTitles(backend),
    count: await backend.librarySeriesCount(NEWEST_FIRST.filter),
    history: (await backend.readingHistory(null, everything)).entries,
    historySeries: await backend.historySeries(),
  };

  await backend.setScreenshotMode(true);
  const hidden = {
    listed: await listedTitles(backend),
    count: await backend.librarySeriesCount(NEWEST_FIRST.filter),
    history: (await backend.readingHistory(null, everything)).entries,
    historySeries: await backend.historySeries(),
    found: (
      await backend.librarySearch(null, {
        text: "Sample Series 1",
        filter: NEWEST_FIRST.filter,
      })
    ).series.map((series) => series.title),
    foundCount: await backend.librarySearchCount({
      text: "Sample Series 1",
      filter: NEWEST_FIRST.filter,
    }),
  };
  await backend.setScreenshotMode(false);

  expect(ADULT_TITLES.every((title) => before.listed.includes(title))).toBe(
    true,
  );
  expect(
    ADULT_TITLES.every((title) =>
      before.historySeries.some((series) => series.title === title),
    ),
  ).toBe(true);
  expect(hidden.listed.filter((title) => ADULT_TITLES.includes(title))).toEqual(
    [],
  );
  expect(hidden.count).toBe(hidden.listed.length);
  expect(hidden.foundCount).toBe(hidden.found.length);
  expect(hidden.found).not.toContain("Sample Series 17");
  expect(
    [
      ...hidden.history.map(({ seriesTitle }) => seriesTitle),
      ...hidden.historySeries.map(({ title }) => title),
    ].filter((title) => ADULT_TITLES.includes(title)),
  ).toEqual([]);
  expect(await listedTitles(backend)).toEqual(before.listed);
  expect(await backend.librarySeriesCount(NEWEST_FIRST.filter)).toBe(
    before.count,
  );
  expect((await backend.readingHistory(null, everything)).entries).toEqual(
    before.history,
  );
});

test("reports whether screenshot mode is on and leaves the stored adult setting alone", async () => {
  const { backend } = backendFor();
  const stored = await backend.libraryAdultContent();

  const off = await backend.getScreenshotMode();
  await backend.setScreenshotMode(true);

  expect([off, await backend.getScreenshotMode()]).toEqual([false, true]);
  expect(await backend.libraryAdultContent()).toEqual(stored);
});

test("counts the writers, folder groups and creator series the same way as their lists while screenshot mode is on", async () => {
  const { backend } = backendFor();
  await backend.setScreenshotMode(true);

  const groups = (await backend.folderGroups(null)).groups;
  const groupCounts = groups.reduce(
    (sum, { seriesCount }) => sum + seriesCount,
    0,
  );
  const writers = (await backend.libraryWriters(null)).writers;
  const writerLists = await Promise.all(
    writers.map(async ({ name }) => ({
      name,
      counted: await backend.writerSeriesCount(name, NEWEST_FIRST.filter),
      listed: (await backend.writerSeries(name, null, NEWEST_FIRST)).series
        .length,
    })),
  );

  expect(groupCounts).toBe(
    await backend.librarySeriesCount(NEWEST_FIRST.filter),
  );
  expect(
    writerLists.filter(({ counted, listed }) => counted !== listed),
  ).toEqual([]);
  expect(writers.every(({ seriesCount }) => seriesCount > 0)).toBe(true);
});

const MARKED_BY_HAND = {
  title: null,
  people: null,
  summary: null,
  isMarkedAdult: true,
} as const;

test("counts and offers only the tags, and relates only the series, that screenshot mode leaves shown", async () => {
  const { backend } = backendFor();
  await backend.editSeriesDetails(sampleSeriesId(7), {
    ...MARKED_BY_HAND,
    tags: ["Hidden only"],
  });
  const before = {
    tags: (await backend.libraryTags()).map(({ name }) => name),
    offered: (await backend.libraryFilterChoices()).tags,
    related: (await backend.seriesOverview(sampleSeriesId(4))).related.map(
      ({ title }) => title,
    ),
  };

  await backend.setScreenshotMode(true);
  const after = {
    tags: await backend.libraryTags(),
    offered: await backend.libraryFilterChoices(),
    related: (await backend.seriesOverview(sampleSeriesId(4))).related.map(
      ({ title }) => title,
    ),
  };

  expect(before.tags).toContain("Hidden only");
  expect(before.offered).toContain("Hidden only");
  expect(before.related).toContain("Sample Series 07");
  expect(after.tags.map(({ name }) => name)).not.toContain("Hidden only");
  expect(after.offered.tags).not.toContain("Hidden only");
  expect(after.offered.ratesAdult).toBe(false);
  expect(after.related).not.toContain("Sample Series 07");
  for (const { name, seriesCount } of after.tags) {
    expect(
      await backend.librarySeriesCount({
        ...NEWEST_FIRST.filter,
        tags: [name],
      }),
    ).toBe(seriesCount);
  }
});

test("gives no sessions or summary for a book of a series screenshot mode hides", async () => {
  const { backend } = backendFor();
  await backend.editSeriesDetails(sampleSeriesId(11), {
    ...MARKED_BY_HAND,
    tags: null,
  });
  const read = (
    await backend.readingHistory(null, { kind: "everything" })
  ).entries.find(({ seriesTitle }) => seriesTitle === "Sample Series 11");
  if (read === undefined) {
    throw new Error("the sample has read nothing of series 11");
  }

  const shown = [
    await backend.bookSessions(read.book),
    await backend.readingSummary(read.book),
  ];
  await backend.setScreenshotMode(true);
  const hidden = [
    await backend.bookSessions(read.book),
    await backend.readingSummary(read.book),
  ];

  expect(shown.every((found) => found !== null)).toBe(true);
  expect(hidden).toEqual([null, null]);
});

test("remembers the choice for adult content", async () => {
  const { backend } = backendFor();
  const blurred = { treatment: "blur", countsAgeRatings: false } as const;

  await backend.setLibraryAdultContent(blurred);

  expect(await backend.libraryAdultContent()).toEqual(blurred);
});

test("lists every series in the sample's folder, and none in another", async () => {
  const { backend } = backendFor();
  const { folders } = await backend.libraryFolders(null);
  const folder = folders.find(({ kind }) => kind === "linked")?.id;
  if (folder === undefined) {
    throw new Error("the sample library links no folder");
  }

  const page = await backend.folderSeries(folder, null, NEWEST_FIRST);
  const count = await backend.folderSeriesCount(folder, NEWEST_FIRST.filter);
  const elsewhere = await backend.folderSeries(
    "another-folder",
    null,
    NEWEST_FIRST,
  );

  expect([page.series.length, count, elsewhere.series]).toEqual([21, 21, []]);
});

test("groups the sample's series in its folder, but for a writer's folder holding two", async () => {
  const { backend } = backendFor();

  const page = await backend.folderGroups(null);
  const total = await backend.folderSeriesCount(
    page.groups[0]?.folder ?? "",
    NEWEST_FIRST.filter,
  );

  expect(
    page.groups.map(({ folderName, path, seriesCount }) => ({
      folderName,
      path,
      seriesCount,
    })),
  ).toEqual([
    { folderName: "Sample Comics", path: [], seriesCount: total - 2 },
    { folderName: "Sample Comics", path: ["Author A"], seriesCount: 2 },
  ]);
});

test("lists and counts the series in the writer's folder, and none in another group", async () => {
  const { backend } = backendFor();
  const { groups } = await backend.folderGroups(null);
  const writerGroup = groups.find(({ path }) => path.length > 0)?.id;
  if (writerGroup === undefined) {
    throw new Error("the sample library groups no series in a writer's folder");
  }

  const page = await backend.folderGroupSeries(writerGroup, null, NEWEST_FIRST);
  const count = await backend.folderGroupSeriesCount(
    writerGroup,
    NEWEST_FIRST.filter,
  );
  const elsewhere = await backend.folderGroupSeries(
    "another-group",
    null,
    NEWEST_FIRST,
  );

  expect([
    page.series.map(({ title }) => title),
    count,
    elsewhere.series,
  ]).toEqual([["Sample Series 01", "Sample Series 04"], 2, []]);
});

test("lists the sample's writers with their series, leaving out those who only draw", async () => {
  const { backend } = backendFor();

  const page = await backend.libraryWriters(null);

  expect(page).toEqual({
    writers: [
      { name: "Author A", seriesCount: 5 },
      { name: "Author B", seriesCount: 1 },
    ],
    next: null,
  });
});

test("leaves out the writers and series hidden with their missing folder", async () => {
  const { backend } = backendFor("?missing=folder");
  await backend.editSeriesDetails(sampleSeriesId(6), {
    title: null,
    people: [
      { name: "Author A", role: "story" },
      { name: "Author E", role: "story" },
    ],
    tags: null,
    summary: null,
    isMarkedAdult: false,
  });

  const page = await backend.libraryWriters(null);

  expect(page.writers).toEqual([
    { name: "Author A", seriesCount: 4 },
    { name: "Author B", seriesCount: 1 },
  ]);
});

test("lists and counts the series naming a writer, and none for an artist", async () => {
  const { backend } = backendFor();

  const byB = await backend.writerSeries("Author B", null, NEWEST_FIRST);
  const countByA = await backend.writerSeriesCount(
    "Author A",
    NEWEST_FIRST.filter,
  );
  const byC = await backend.writerSeries("Author C", null, NEWEST_FIRST);

  expect([byB.series.map(({ title }) => title), countByA, byC.series]).toEqual([
    [LONG_TITLE],
    5,
    [],
  ]);
});

test("lists and counts the series whose files name no writer", async () => {
  const { backend } = backendFor();

  const unnamed = await backend.writerlessSeries(null, NEWEST_FIRST);
  const count = await backend.writerlessSeriesCount(NEWEST_FIRST.filter);

  expect(count).toBe(16);
  expect(unnamed.series.map(({ title }) => title)).toContain(
    "Sample Series 02",
  );
  expect(unnamed.series.map(({ title }) => title)).not.toContain(
    "Sample Series 01",
  );
});

test("takes a series out of the unnamed group once its details name a writer", async () => {
  const { backend } = backendFor();
  await backend.editSeriesDetails(sampleSeriesId(2), {
    title: null,
    people: [{ name: "Author E", role: "story" }],
    tags: null,
    summary: null,
    isMarkedAdult: false,
  });

  const unnamed = await backend.writerlessSeries(null, NEWEST_FIRST);
  const count = await backend.writerlessSeriesCount(NEWEST_FIRST.filter);

  expect(count).toBe(15);
  expect(unnamed.series.map(({ title }) => title)).not.toContain(
    "Sample Series 02",
  );
});

test("lists every tag the sample's series carry, with how many carry each", async () => {
  const { backend } = backendFor();

  const tags = await backend.libraryTags();

  expect(tags.find((tag) => tag.name === "Seinen")).toEqual({
    name: "Seinen",
    seriesCount: 1,
  });
});

test("renames a tag on every series carrying it", async () => {
  const { backend } = backendFor();

  await backend.renameLibraryTag("Seinen", "Grown-up");
  const names = (await backend.libraryTags()).map((tag) => tag.name);

  expect([names.includes("Seinen"), names.includes("Grown-up")]).toEqual([
    false,
    true,
  ]);
});

test("removes a tag from every series, naming them so it can go back", async () => {
  const { backend } = backendFor();

  const held = await backend.removeLibraryTag("Seinen");
  await backend.labelSeries(held, {
    categoriesAdded: [],
    categoriesRemoved: [],
    categoriesCreated: [],
    tagsAdded: ["Seinen"],
    tagsRemoved: [],
  });

  expect([
    held,
    (await backend.libraryTags()).some((tag) => tag.name === "Seinen"),
  ]).toEqual([[sampleSeriesId(4)], true]);
});

test("lists the series read last first, then those never read", async () => {
  const { backend } = backendFor();
  const history = await backend.readingHistory(null, { kind: "everything" });
  const readTitles = new Set(history.entries.map((entry) => entry.seriesTitle));

  const page = await backend.librarySeries(null, {
    ...NEW_LIBRARY_LISTING,
    sort: { by: "lastRead", direction: "descending" },
  });

  const titles = page.series.map((series) => series.title);
  expect(new Set(titles.slice(0, readTitles.size))).toEqual(readTitles);
});

test("lists the series that gained a book last first, then the rest newest first", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySeries(null, {
    ...NEW_LIBRARY_LISTING,
    sort: { by: "lastUpdated", direction: "descending" },
  });

  expect(page.series.slice(0, 5).map((series) => series.title)).toEqual([
    "Sample Series 04",
    "Sample Series 01",
    "Sample Series 02",
    LONG_TITLE,
    "Sample Series 03",
  ]);
});

test("lists the series with the most unread books first", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySeries(null, {
    ...NEW_LIBRARY_LISTING,
    sort: { by: "unreadCount", direction: "descending" },
  });

  const unreadCounts = page.series.map((series) => series.unreadCount);
  expect(unreadCounts).toEqual(
    unreadCounts.toSorted((one, other) => other - one),
  );
  expect(unreadCounts[0]).toBeGreaterThan(unreadCounts.at(-1) ?? 0);
});

test("lists the series quickest to finish first", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySeries(null, {
    ...NEW_LIBRARY_LISTING,
    sort: { by: "timeLeft", direction: "ascending" },
  });

  const secondsLeft = await Promise.all(
    page.series.map(
      async (series) =>
        (await backend.seriesOverview(series.id)).secondsLeft ?? 0,
    ),
  );
  expect(secondsLeft).toEqual(
    secondsLeft.toSorted((one, other) => one - other),
  );
  expect(secondsLeft.at(-1)).toBeGreaterThan(secondsLeft[0] ?? 0);
});

test("starts the library's tabs with All shown and New chapters hidden", async () => {
  const { backend } = backendFor();

  expect(await backend.libraryTabs()).toEqual(NEW_LIBRARY_TABS);
});

test("remembers the library's tabs as they were set", async () => {
  const { backend } = backendFor();
  const tabs = NEW_LIBRARY_TABS.toReversed().map((tab) => ({
    ...tab,
    isHidden: false,
  }));

  await backend.setLibraryTabs(tabs);

  expect(await backend.libraryTabs()).toEqual(tabs);
});

test("suggests the words of a chapter title close to a search, naming its series", async () => {
  const { backend } = backendFor();

  expect(await backend.librarySpellingSuggestion("harbor gat")).toEqual({
    text: "harbour gate",
    chapterOf: LONG_TITLE,
  });
});

test("suggests the words of a series title close to a search", async () => {
  const { backend } = backendFor();

  expect(await backend.librarySpellingSuggestion("smaple")).toEqual({
    text: "sample",
    chapterOf: null,
  });
});

test("suggests nothing for a search close to no title", async () => {
  const { backend } = backendFor();

  expect(await backend.librarySpellingSuggestion("quixotic")).toBeNull();
});

test("hides the series of a missing folder, saying how many", async () => {
  const { backend } = backendFor("?missing=folder");
  const every = await backendFor().backend.librarySeriesCount(
    NEW_LIBRARY_LISTING.filter,
  );

  const [missing] = await backend.missingLibraryFolders();

  expect([
    missing?.folder.name,
    missing?.problem.kind,
    missing?.hiddenSeries,
    missing?.isShownAnyway,
    every - (await backend.librarySeriesCount(NEW_LIBRARY_LISTING.filter)),
    await backend.libraryHiddenSeriesCount(),
  ]).toEqual(["Comics", "missing", 6, false, 6, 6]);
});

test("shows the series of a missing folder once asked", async () => {
  const { backend } = backendFor("?missing=folder");
  const [missing] = await backend.missingLibraryFolders();

  await backend.showMissingLibraryFolder(missing?.folder.id ?? "", true);

  const [shown] = await backend.missingLibraryFolders();
  expect([
    shown?.isShownAnyway,
    await backend.libraryHiddenSeriesCount(),
  ]).toEqual([true, 0]);
});

test("finds a missing folder again where it went", async () => {
  const { backend } = backendFor("?missing=folder");
  const [missing] = await backend.missingLibraryFolders();

  await backend.relocateLibraryFolder(missing?.folder.id ?? "", {
    send: () => Promise.resolve(),
  });

  expect([
    await backend.missingLibraryFolders(),
    await backend.libraryHiddenSeriesCount(),
  ]).toEqual([[], 0]);
});

test("signs in to a share that wants it, which brings it back", async () => {
  const { backend } = backendFor("?missing=sign-in");
  const [missing] = await backend.missingLibraryFolders();

  const signedIn = await backend.signInToLibraryFolder(
    missing?.folder.id ?? "",
  );

  expect([
    signedIn,
    await backend.missingLibraryFolders(),
    await backend.libraryHiddenSeriesCount(),
  ]).toEqual(["signedIn", [], 0]);
});

test("cancels or fails a sign-in once asked, leaving the share missing", async () => {
  const outcomes = await Promise.all(
    ["cancelled", "failed"].map(async (signIn) => {
      const { backend } = backendFor(`?missing=sign-in&signin=${signIn}`);
      const [missing] = await backend.missingLibraryFolders();
      const signedIn = await backend.signInToLibraryFolder(
        missing?.folder.id ?? "",
      );
      return [signedIn, (await backend.missingLibraryFolders()).length];
    }),
  );

  expect(outcomes).toEqual([
    ["cancelled", 1],
    ["failed", 1],
  ]);
});

test("leaves a share missing when choosing it again is cancelled or fails", async () => {
  const outcomes = await Promise.all(
    ["cancelled", "failed"].map(async (signIn) => {
      const { backend } = backendFor(`?missing=share&signin=${signIn}`);
      const [missing] = await backend.missingLibraryFolders();
      const relocated = await backend.relocateLibraryFolder(
        missing?.folder.id ?? "",
        { send: () => Promise.resolve() },
      );
      return [
        relocated?.outcome.kind ?? null,
        (await backend.missingLibraryFolders()).length,
      ];
    }),
  );

  expect(outcomes).toEqual([
    [null, 1],
    ["unreachable", 1],
  ]);
});

test("tells a disconnected drive, lost access and each share apart", async () => {
  const problems = await Promise.all(
    ["drive", "access", "sign-in", "mount", "share"].map(async (kind) => {
      const [missing] = await backendFor(
        `?missing=${kind}`,
      ).backend.missingLibraryFolders();
      return missing?.problem.kind;
    }),
  );

  expect(problems).toEqual([
    "driveDisconnected",
    "lostAccess",
    "needsSignIn",
    "needsMounting",
    "shareUnreachable",
  ]);
});

test("holds thousands of series once asked, as the fast-scroll boards draw", async () => {
  const { backend } = backendFor("?library=thousands");

  expect(await backend.librarySeriesCount(NEW_LIBRARY_LISTING.filter)).toBe(
    12_480,
  );
});

test("lists each book read once in History, newest first, found by title", async () => {
  const { backend } = backendFor();

  const all = await backend.readingHistory(null, {
    kind: "books",
    matching: "",
  });
  const found = await backend.readingHistory(null, {
    kind: "books",
    matching: "SERIES 04",
  });

  const started = all.entries.map((entry) => entry.startedAtMs);
  expect([
    new Set(all.entries.map((entry) => entry.book)).size,
    started.toSorted((one, other) => other - one),
    found.entries.every((entry) => entry.seriesTitle === "Sample Series 04"),
    found.entries.length > 0,
  ]).toEqual([all.entries.length, started, true, true]);
});

test("removes a book from History and puts it back on Undo", async () => {
  const { backend } = backendFor();
  const books = { kind: "books", matching: "" } as const;
  const [first] = (await backend.readingHistory(null, books)).entries;
  const book = first?.book ?? "";

  const mark = await backend.removeFromHistory(book);
  const removed = (await backend.readingHistory(null, books)).entries;
  await backend.restoreToHistory(book, mark);
  const restored = (await backend.readingHistory(null, books)).entries;

  expect([
    removed.some((entry) => entry.book === book),
    restored.some((entry) => entry.book === book),
  ]).toEqual([false, true]);
});

test("clears History and puts it back on Undo", async () => {
  const { backend } = backendFor();
  const books = { kind: "books", matching: "" } as const;
  const before = (await backend.readingHistory(null, books)).entries.length;

  const mark = await backend.clearHistory();
  const cleared = (await backend.readingHistory(null, books)).entries.length;
  await backend.restoreHistory(mark);

  expect([
    cleared,
    (await backend.readingHistory(null, books)).entries.length,
  ]).toEqual([0, before]);
});

test("lists the last book of a series read to the end as finished", async () => {
  const { backend } = backendFor();

  const { entries } = await backend.readingHistory(null, {
    kind: "books",
    matching: "",
  });

  expect(entries.some((entry) => entry.readTo.state === "end")).toBe(true);
});

test("fails to read History when the library can't be read", async () => {
  const { backend } = backendFor("?library=failed");

  await expect(
    backend.readingHistory(null, { kind: "books", matching: "" }),
  ).rejects.toThrow();
});

test("keeps edits to a series' details", async () => {
  const { backend } = backendFor();

  expect(await backend.keepsDetailEdits()).toBe(true);
});

test("gives a series' details as its files say, with nothing edited", async () => {
  const { backend } = backendFor();

  const details = await backend.seriesDetails(sampleSeriesId(4));

  expect(details).toEqual({
    title: { fromFile: "Sample Series 04", source: "folderName", edited: null },
    people: {
      fromFile: [{ name: "Author A", role: "storyAndArt" }],
      edited: null,
    },
    tags: {
      fromFile: ["Slice of life", "Seinen", "Sea", "Letters"],
      edited: null,
    },
    summary: {
      fromFile:
        "A lighthouse keeper’s apprentice spends a winter at the harbour gate, writing letters to a sister across the northern sea.",
      edited: null,
    },
    year: { fromFile: 2008, source: "files" },
    language: { fromFile: "ja", source: "fileName" },
    isMarkedAdult: false,
    isRatedAdult: false,
  });
});

test("shows the edited details over the files' everywhere the series appears", async () => {
  const { backend } = backendFor();
  const series = sampleSeriesId(4);

  await backend.editSeriesDetails(series, {
    title: "The Harbour Gate",
    people: [{ name: "Author C", role: "art" }],
    tags: ["Seinen"],
    summary: "Letters across the sea.",
    isMarkedAdult: true,
  });
  const overview = await backend.seriesOverview(series);
  const listed = (await backend.librarySeries(null, NEWEST_FIRST)).series.find(
    ({ id }) => id === series,
  );

  expect({
    title: overview.title,
    creators: overview.creators.map(({ name, role }) => [name, role]),
    tags: overview.tags,
    summary: overview.summary,
    listed: [listed?.title, listed?.isAdult],
    edited: (await backend.seriesDetails(series)).title,
  }).toEqual({
    title: "The Harbour Gate",
    creators: [["Author C", "art"]],
    tags: ["Seinen"],
    summary: "Letters across the sea.",
    listed: ["The Harbour Gate", true],
    edited: {
      fromFile: "Sample Series 04",
      source: "folderName",
      edited: "The Harbour Gate",
    },
  });
});

test("goes back to the file's value for each detail left out", async () => {
  const { backend } = backendFor();
  const series = sampleSeriesId(4);
  await backend.editSeriesDetails(series, {
    title: "The Harbour Gate",
    people: [],
    tags: [],
    summary: "Letters across the sea.",
    isMarkedAdult: true,
  });

  await backend.editSeriesDetails(series, {
    title: null,
    people: null,
    tags: null,
    summary: null,
    isMarkedAdult: false,
  });
  const overview = await backend.seriesOverview(series);

  expect([
    overview.title,
    overview.tags.length,
    overview.creators.length,
  ]).toEqual(["Sample Series 04", 4, 1]);
});

test("says the files rate a series 18+", async () => {
  const { backend } = backendFor();

  expect((await backend.seriesDetails(sampleSeriesId(13))).isRatedAdult).toBe(
    true,
  );
});

test("opens on the first launch when asked, until it is finished", async () => {
  const { backend } = backendFor("?launch=first");

  const before = await backend.firstLaunchFinished();
  await backend.finishFirstLaunch();
  const after = await backend.firstLaunchFinished();

  expect([before, after]).toEqual([false, true]);
});

test("starts with the first launch finished", async () => {
  const { backend } = backendFor();

  expect(await backend.firstLaunchFinished()).toBe(true);
});

test("lists the home folder the app keeps its data in before the linked one", async () => {
  const { backend } = backendFor("?platform=linux");

  const page = await backend.libraryFolders(null);

  expect(page.folders.map((folder) => [folder.kind, folder.location])).toEqual([
    ["home", "~/.local/share/app.omnileaf"],
    ["linked", "/media/Sample Comics"],
  ]);
});

test("keeps the home folder in an empty library", async () => {
  const { backend } = backendFor("?library=empty");

  const page = await backend.libraryFolders(null);

  expect(page.folders.map((folder) => folder.kind)).toEqual(["home"]);
});

test("finds no library already in the home folder", async () => {
  const { backend } = backendFor();

  expect(await backend.foundLibrary()).toBeNull();
});

test("finds its own series and books already in the home folder when asked, last backed up on 12 October", async () => {
  const { backend } = backendFor("?home=library");

  const found = await backend.foundLibrary();

  expect(found).toEqual({
    series: 21,
    books: 336,
    lastBackupAtMs: Date.UTC(2026, 9, 12, 9),
  });
});

const PICKED_HOME = "Internal storage › Folder";

test.each(["android", "linux", "ios"])(
  "cancels choosing a home folder on %s unless asked otherwise",
  async (platform) => {
    const { backend } = backendFor(`?platform=${platform}`);

    expect(await backend.chooseHomeFolder()).toBeNull();
  },
);

test("offers an empty folder for the home folder on Android when asked to", async () => {
  const { backend } = backendFor("?platform=android&homepick=empty");

  expect(await backend.chooseHomeFolder()).toEqual({
    location: PICKED_HOME,
    choice: { kind: "empty" },
  });
});

test("offers the current home folder again on Android when asked to", async () => {
  const { backend } = backendFor("?platform=android&homepick=current");

  expect(await backend.chooseHomeFolder()).toEqual({
    location: PICKED_HOME,
    choice: { kind: "current" },
  });
});

test("can't read the folder picked for the home folder on Android when asked to", async () => {
  const { backend } = backendFor("?platform=android&homepick=unreadable");

  const choosing = (async () => backend.chooseHomeFolder())();

  await expect(choosing).rejects.toMatchObject({
    error: { code: "folderUnreadable" },
  });
});

test("keeps choosing a home folder cancelled off Android, whatever is asked", async () => {
  const { backend } = backendFor("?platform=linux&homepick=empty");

  expect(await backend.chooseHomeFolder()).toBeNull();
});

test("moves the home folder on Android without restarting", async () => {
  const { backend } = backendFor("?platform=android&homepick=empty");
  await backend.chooseHomeFolder();

  const moved = await backend.moveHomeFolder();

  expect(moved.kind).toBe("moved");
});

test("lists the moved folder as the home folder at the place it was picked", async () => {
  const { backend } = backendFor("?platform=android&homepick=empty");
  await backend.chooseHomeFolder();
  const moved = await backend.moveHomeFolder();

  const { folders } = await backend.libraryFolders(null);

  expect(
    folders
      .filter((folder) => folder.kind === "home")
      .map((folder) => [folder.id, folder.location]),
  ).toEqual([[moved.kind === "moved" && moved.folder, PICKED_HOME]]);
});

test("keeps the home folder where it was until a move lands", async () => {
  const { backend } = backendFor("?platform=android&homepick=empty");
  await backend.chooseHomeFolder();

  const { folders } = await backend.libraryFolders(null);

  expect(folders.find((folder) => folder.kind === "home")?.location).toBe(
    "/data/user/0/app.omnileaf",
  );
});

test("restarts after moving the home folder on a desktop", async () => {
  const { backend } = backendFor("?platform=linux");

  expect(await backend.moveHomeFolder()).toEqual({ kind: "restarting" });
});

test("ignores an unknown home folder pick", () => {
  expect(scenarioFrom(new URLSearchParams("homepick=sideways")).homePick).toBe(
    "cancel",
  );
});

test("uses its storage as the Storage board draws it, with room to spare", async () => {
  const { backend } = backendFor();

  const used = await backend.checkStorage();

  expect(used).toMatchObject({
    omnileafBytes: 1_440_000_000,
    cachedPagesBytes: 1_200_000_000,
    coversBytes: 210_000_000,
    isLow: false,
  });
});

test("runs low with 1.1 GB free when asked to", async () => {
  const { backend } = backendFor("?space=low");

  const used = await backend.checkStorage();

  expect([used.freeBytes, used.isLow]).toEqual([1_100_000_000, true]);
});

test("frees what it clears and stops running low once there's room", async () => {
  const { backend } = backendFor("?space=low");

  await backend.clearCachedPages();
  await backend.clearCovers();
  const used = await backend.checkStorage();

  expect(used).toMatchObject({
    omnileafBytes: 30_000_000,
    cachedPagesBytes: 0,
    coversBytes: 0,
    freeBytes: 2_510_000_000,
    isLow: false,
  });
});

const VOLUME_TWO = {
  shown: "all",
  direction: "ascending",
  volume: 2,
} as const;

test("lists the chapters filed in one volume of the sample series that files chapters in volumes, and sums the volume up", async () => {
  const { backend } = backendFor();
  const series = sampleSeriesId(21);

  const second = await backend.seriesBooks(series, VOLUME_TWO, null);
  const overview = await backend.seriesVolume(series, 2);
  const absent = await backend.seriesVolume(series, 3);

  expect([
    second.books.map((book) => book.title),
    overview?.bookCount,
    overview?.readCount,
    absent,
  ]).toEqual([
    [
      "Volume 2 · Chapter 5",
      "Volume 2 · Chapter 6",
      "Volume 2 · Chapter 7",
      "Volume 2 · Chapter 8",
    ],
    4,
    1,
    null,
  ]);
});

const SHOWING_EVERY_BOOK = {
  shown: "all",
  direction: "ascending",
} as const;

const LIBRARY_FOLDER = "folder";

const NO_PROGRESS_CHANNEL = { send: () => Promise.resolve() };

test("drops a removed series and its books from the library", async () => {
  const { backend } = backendFor();
  const before = await backend.libraryFolderBookCount(LIBRARY_FOLDER);

  const report = await backend.removeFromLibrary(
    [{ kind: "series", id: sampleSeriesId(8) }],
    false,
  );

  const titles = (await backend.librarySeries(null, NEWEST_FIRST)).series.map(
    (series) => series.title,
  );
  expect([
    report.removedSeries,
    report.removedBooks,
    titles.includes("Sample Series 08"),
    await backend.libraryFolderBookCount(LIBRARY_FOLDER),
    await backend.librarySeriesCount(NEW_LIBRARY_LISTING.filter),
  ]).toEqual([1, 4, false, before - 4, 20]);
});

test("removes a single book and leaves the other books under their own ids", async () => {
  const { backend } = backendFor();
  const series = sampleSeriesId(8);

  const report = await backend.removeFromLibrary(
    [{ kind: "book", id: sampleBookId(8, 2) }],
    false,
  );

  const { books } = await backend.seriesBooks(series, SHOWING_EVERY_BOOK, null);
  expect([report.removedSeries, report.removedBooks]).toEqual([0, 1]);
  expect(books.map((book) => book.id)).toEqual([
    sampleBookId(8, 1),
    sampleBookId(8, 3),
    sampleBookId(8, 4),
  ]);
});

test("counts a series and one of its books once, and an unknown target not at all", async () => {
  const { backend } = backendFor();

  const report = await backend.removeFromLibrary(
    [
      { kind: "series", id: sampleSeriesId(10) },
      { kind: "book", id: sampleBookId(10, 1) },
      { kind: "series", id: sampleSeriesId(999) },
      { kind: "book", id: sampleBookId(999, 1) },
    ],
    false,
  );

  expect([report.removedSeries, report.removedBooks]).toEqual([1, 2]);
});

test("previews a series as its books, one file each, in the sample folder", async () => {
  const { backend } = backendFor();

  const preview = await backend.previewRemoval([
    { kind: "series", id: sampleSeriesId(8) },
  ]);

  expect(preview).toEqual({ books: 4, files: 4, folders: 1 });
});

test("previews a single book as one file in one folder", async () => {
  const { backend } = backendFor();

  const preview = await backend.previewRemoval([
    { kind: "book", id: sampleBookId(8, 2) },
  ]);

  expect(preview).toEqual({ books: 1, files: 1, folders: 1 });
});

test("previews a series and one of its books once, and an unknown target not at all", async () => {
  const { backend } = backendFor();

  const preview = await backend.previewRemoval([
    { kind: "series", id: sampleSeriesId(10) },
    { kind: "book", id: sampleBookId(10, 1) },
    { kind: "series", id: sampleSeriesId(999) },
    { kind: "book", id: sampleBookId(999, 1) },
  ]);

  expect(preview).toEqual({ books: 2, files: 2, folders: 1 });
});

test("previews no folders when no target is held", async () => {
  const { backend } = backendFor();

  const preview = await backend.previewRemoval([
    { kind: "series", id: sampleSeriesId(999) },
  ]);

  expect(preview).toEqual({ books: 0, files: 0, folders: 0 });
});

test("previews the same answer when asked again", async () => {
  const { backend } = backendFor();
  const targets: RemovalTarget[] = [{ kind: "series", id: sampleSeriesId(8) }];
  const first = await backend.previewRemoval(targets);

  const again = await backend.previewRemoval(targets);

  expect(again).toEqual(first);
});

test("previews what deleting the same targets then reports as files", async () => {
  const { backend } = backendFor();
  const targets: RemovalTarget[] = [
    { kind: "series", id: sampleSeriesId(8) },
    { kind: "book", id: sampleBookId(8, 1) },
    { kind: "book", id: sampleBookId(1, 3) },
  ];
  const preview = await backend.previewRemoval(targets);

  const report = await backend.removeFromLibrary(targets, true);

  expect([preview.books, preview.files]).toEqual([
    report.removedBooks,
    report.files.length,
  ]);
});

test("previews nothing for books already removed", async () => {
  const { backend } = backendFor();
  const targets: RemovalTarget[] = [{ kind: "series", id: sampleSeriesId(8) }];
  await backend.removeFromLibrary(targets, false);

  const preview = await backend.previewRemoval(targets);

  expect(preview).toEqual({ books: 0, files: 0, folders: 0 });
});

test("previews a series again after its folder is added back", async () => {
  const { backend } = backendFor();
  const targets: RemovalTarget[] = [{ kind: "series", id: sampleSeriesId(8) }];
  await backend.removeFromLibrary(targets, false);
  await backend.addLibraryFolder(NO_PROGRESS_CHANNEL);

  const preview = await backend.previewRemoval(targets);

  expect(preview).toEqual({ books: 4, files: 4, folders: 1 });
});

test("changes nothing in the library and wakes nothing when it previews", async () => {
  const { backend, emitted } = backendFor();
  const before = await backend.libraryFolderBookCount(LIBRARY_FOLDER);

  await backend.previewRemoval([{ kind: "series", id: sampleSeriesId(8) }]);

  expect(await backend.libraryFolderBookCount(LIBRARY_FOLDER)).toBe(before);
  expect(emitted).toEqual([]);
});

function volumesOf(series: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    sampleBookId(series, index + 1),
  );
}

async function outcomesOfDeleting(search: string, series: number) {
  const { backend } = backendFor(search);
  const report = await backend.removeFromLibrary(
    [{ kind: "series", id: sampleSeriesId(series) }],
    true,
  );
  return report.files.map(({ book, outcome }) => [book, outcome]);
}

test("trashes every file of a removed series by default", async () => {
  const outcomes = await outcomesOfDeleting("", 8);

  expect(outcomes).toEqual(
    volumesOf(8, 4).map((book) => [book, { kind: "trashed" }]),
  );
});

test("names each file after its book and type", async () => {
  const { backend } = backendFor();

  const report = await backend.removeFromLibrary(
    [{ kind: "series", id: sampleSeriesId(8) }],
    true,
  );

  expect(report.files.map(({ name }) => name)).toEqual([
    "Volume 1.cbz",
    "Volume 2.cbz",
    "Volume 3.cbz",
    "Volume 4.cbz",
  ]);
});

test.each(["ios", "android"])(
  "deletes the files outright on %s, which has no trash",
  async (platform) => {
    const outcomes = await outcomesOfDeleting(`platform=${platform}`, 8);

    expect(outcomes).toEqual(
      volumesOf(8, 4).map((book) => [book, { kind: "deleted" }]),
    );
  },
);

test("reports a missing file as missing and trashes the rest", async () => {
  const outcomes = await outcomesOfDeleting("", 4);

  expect(outcomes.map(([, outcome]) => outcome)).toEqual([
    { kind: "trashed" },
    { kind: "trashed" },
    { kind: "trashed" },
    { kind: "trashed" },
    { kind: "trashed" },
    { kind: "missing" },
    { kind: "trashed" },
    { kind: "trashed" },
  ]);
});

test("reports every kind of outcome when the removal is mixed", async () => {
  const outcomes = await outcomesOfDeleting("removal=mixed", 8);

  expect(outcomes).toEqual([
    [sampleBookId(8, 1), { kind: "trashed" }],
    [sampleBookId(8, 2), { kind: "deleted" }],
    [sampleBookId(8, 3), { kind: "missing" }],
    [sampleBookId(8, 4), { kind: "failed", reason: "permissionDenied" }],
  ]);
});

test("fails each file for a different reason when the removal is failed", async () => {
  const outcomes = await outcomesOfDeleting("removal=failed", 8);

  expect(outcomes).toEqual([
    [sampleBookId(8, 1), { kind: "failed", reason: "permissionDenied" }],
    [sampleBookId(8, 2), { kind: "failed", reason: "locked" }],
    [sampleBookId(8, 3), { kind: "failed", reason: "unsupportedLocation" }],
    [sampleBookId(8, 4), { kind: "failed", reason: "other" }],
  ]);
});

test("ignores an unknown removal scenario", () => {
  expect(scenarioFrom(new URLSearchParams("removal=sideways")).removal).toBe(
    "clean",
  );
});

test("returns no files when it keeps the files", async () => {
  const { backend } = backendFor();

  const report = await backend.removeFromLibrary(
    [{ kind: "series", id: sampleSeriesId(8) }],
    false,
  );

  expect(report.files).toEqual([]);
});

test("leaves removed books removed after a rescan", async () => {
  const { backend } = backendFor();
  await backend.removeFromLibrary(
    [
      { kind: "series", id: sampleSeriesId(8) },
      { kind: "book", id: sampleBookId(1, 1) },
    ],
    false,
  );

  await backend.rescanLibraryFolder(LIBRARY_FOLDER, NO_PROGRESS_CHANNEL);

  const { books } = await backend.seriesBooks(
    sampleSeriesId(1),
    SHOWING_EVERY_BOOK,
    null,
  );
  expect(books).toHaveLength(11);
  expect(await backend.librarySeriesCount(NEW_LIBRARY_LISTING.filter)).toBe(20);
});

test("brings removed books back with their reading when the folder is added again", async () => {
  const { backend } = backendFor();
  await backend.markBooks([sampleBookId(8, 2)], "read");
  await backend.removeFromLibrary(
    [
      { kind: "series", id: sampleSeriesId(8) },
      { kind: "book", id: sampleBookId(1, 3) },
    ],
    false,
  );

  const scan = await backend.addLibraryFolder(NO_PROGRESS_CHANNEL);

  const eight = await backend.seriesBooks(
    sampleSeriesId(8),
    SHOWING_EVERY_BOOK,
    null,
  );
  const one = await backend.seriesBooks(
    sampleSeriesId(1),
    SHOWING_EVERY_BOOK,
    null,
  );
  expect(scan).toMatchObject({ series: 1, books: 5 });
  expect(eight.books.map((book) => book.id)).toEqual([
    sampleBookId(8, 1),
    sampleBookId(8, 2),
    sampleBookId(8, 3),
    sampleBookId(8, 4),
  ]);
  expect(eight.books[1]?.reading).toEqual({ state: "read" });
  expect(one.books.map((book) => book.position)).toEqual(
    Array.from({ length: 12 }, (_, index) => index + 1),
  );
  expect(await backend.librarySeriesCount(NEW_LIBRARY_LISTING.filter)).toBe(21);
});

test("wakes library changes when it removes", async () => {
  const { backend, emitted } = backendFor();

  await backend.removeFromLibrary(
    [{ kind: "book", id: sampleBookId(8, 1) }],
    false,
  );

  expect(emitted).toEqual(["library-changed"]);
});

test("keeps the art of the books after a removed one where it was", async () => {
  const { backend } = backendFor();
  const series = sampleSeriesId(8);
  const before = await backend.seriesBooks(series, SHOWING_EVERY_BOOK, null);
  const coverOf = (books: typeof before.books, id: string) =>
    books.find((book) => book.id === id)?.cover;
  const pathsOf = async (id: string) =>
    (await backend.openBook(id, [])).pages.map(({ path }) => path);
  const thirdPagesBefore = await pathsOf(sampleBookId(8, 3));

  await backend.removeFromLibrary(
    [{ kind: "book", id: sampleBookId(8, 2) }],
    false,
  );

  const after = await backend.seriesBooks(series, SHOWING_EVERY_BOOK, null);
  expect(after.books.map((book) => book.position)).toEqual([1, 2, 3]);
  expect(coverOf(after.books, sampleBookId(8, 3))).toBe(
    coverOf(before.books, sampleBookId(8, 3)),
  );
  expect(coverOf(after.books, sampleBookId(8, 4))).toBe(
    coverOf(before.books, sampleBookId(8, 4)),
  );
  expect(await pathsOf(sampleBookId(8, 3))).toEqual(thirdPagesBefore);
});

test.each([
  {
    reading: "finished",
    series: 8,
    matching: "Sample Series 08",
    read: [sampleBookId(8, 3)],
  },
  { reading: "started", series: 4, matching: "Sample Series 04", read: [] },
])(
  "keeps the cover of a $reading book in History after a removed one before it",
  async ({ series, matching, read }) => {
    const { backend } = backendFor();
    const books = { kind: "books", matching } as const;
    await backend.markBooks(read, "read");
    const coversOf = async () =>
      (await backend.readingHistory(null, books)).entries.map(
        ({ book, cover }) => [book, cover],
      );
    const before = await coversOf();

    await backend.removeFromLibrary(
      [{ kind: "book", id: sampleBookId(series, 2) }],
      false,
    );

    expect(before).not.toEqual([]);
    expect(await coversOf()).toEqual(before);
  },
);

test("keeps the reading and bookmarks of the books after a removed one", async () => {
  const { backend } = backendFor();
  const third = sampleBookId(8, 3);
  await backend.markBooks([third], "read");
  await backend.bookmarkPages(third, [4], true);

  await backend.removeFromLibrary(
    [{ kind: "book", id: sampleBookId(8, 2) }],
    false,
  );

  const { books } = await backend.seriesBooks(
    sampleSeriesId(8),
    SHOWING_EVERY_BOOK,
    null,
  );
  const bookmarked = await backend.librarySeries(
    null,
    filtered({ bookmarked: "only" }),
  );
  expect(books.find((book) => book.id === third)?.reading).toEqual({
    state: "read",
  });
  expect((await backend.openBook(third, [])).bookmarkedPages).toEqual([4]);
  expect(bookmarked.series.map(({ title }) => title)).toEqual([
    "Sample Series 08",
  ]);
});

test("drops the bookmark of a removed book from the series", async () => {
  const { backend } = backendFor();
  await backend.bookmarkPages(sampleBookId(8, 2), [4], true);

  await backend.removeFromLibrary(
    [{ kind: "book", id: sampleBookId(8, 2) }],
    false,
  );

  const bookmarked = await backend.librarySeries(
    null,
    filtered({ bookmarked: "only" }),
  );
  expect(bookmarked.series).toEqual([]);
});

test("wakes library changes when a removal is undone by adding the folder", async () => {
  const { backend, emitted } = backendFor();
  await backend.removeFromLibrary(
    [{ kind: "book", id: sampleBookId(8, 1) }],
    false,
  );
  emitted.length = 0;

  await backend.addLibraryFolder(NO_PROGRESS_CHANNEL);

  expect(emitted).toEqual(["library-changed"]);
});

type ChapterHit = Awaited<
  ReturnType<FakeBackend["librarySearchChapters"]>
>["hits"][number];

const EVERY_SERIES: LibraryFilter = NEW_LIBRARY_LISTING.filter;

function chapterSearch(text: string, filter: Partial<LibraryFilter> = {}) {
  return { text, filter: { ...EVERY_SERIES, ...filter } };
}

async function everyChapterHit(
  backend: FakeBackend,
  text: string,
  filter: Partial<LibraryFilter> = {},
) {
  const hits: ChapterHit[] = [];
  let next: Parameters<FakeBackend["librarySearchChapters"]>[1] = null;
  do {
    const page = await backend.librarySearchChapters(
      chapterSearch(text, filter),
      next,
    );
    hits.push(...page.hits);
    next = page.next;
  } while (next !== null);
  return hits;
}

const seriesTitlesOf = (hits: readonly ChapterHit[]) => [
  ...new Set(hits.map((hit) => hit.seriesTitle)),
];

test("finds no chapter for blank text, answering an empty page of none", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySearchChapters(chapterSearch("   "), null);

  expect(page).toEqual({ hits: [], next: null, count: 0 });
});

test("finds no chapter for fewer than three characters, answering an empty page of none", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySearchChapters(chapterSearch(" ch "), null);

  expect(page).toEqual({ hits: [], next: null, count: 0 });
});

test("finds a chapter by its file name, naming its series, book and position", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySearchChapters(
    chapterSearch("harbour gate"),
    null,
  );

  expect(page).toEqual({
    hits: [
      {
        series: sampleSeriesId(19),
        seriesTitle: LONG_TITLE,
        book: sampleBookId(19, 1),
        position: 1,
        title: "Volume 1 · Arrival at the Harbour Gate",
        matchedIn: "fileName",
      },
      {
        series: sampleSeriesId(11),
        seriesTitle: "Sample Series 11",
        book: sampleBookId(11, 148),
        position: 148,
        title: "Chapter 148 · The Harbour Gate at Night",
        matchedIn: "fileName",
      },
    ],
    next: null,
    count: 2,
  });
});

test("reports every hit as found by file name, the sample books holding no ComicInfo title", async () => {
  const { backend } = backendFor();

  const hits = await everyChapterHit(backend, "chapter");

  expect(new Set(hits.map((hit) => hit.matchedIn))).toEqual(
    new Set(["fileName"]),
  );
});

test("finds a chapter whatever the letter case and order of the words typed", async () => {
  const { backend } = backendFor();

  const hits = await everyChapterHit(backend, "GATE  Harbour");

  expect(hits.map((hit) => hit.book)).toEqual([
    sampleBookId(19, 1),
    sampleBookId(11, 148),
  ]);
});

test("finds no chapter while every series holds no books", async () => {
  const { backend } = backendFor("series=empty");

  const page = await backend.librarySearchChapters(
    chapterSearch("volume"),
    null,
  );

  expect(page).toEqual({ hits: [], next: null, count: 0 });
});

test("finds no chapter in the series of a missing folder", async () => {
  const { backend } = backendFor("missing=folder");
  const missing = new Set([3, 6, 9, 12, 15, 18].map(sampleSeriesId));

  const hits = await everyChapterHit(backend, "volume 2");

  expect(hits.length).toBeGreaterThan(0);
  expect(hits.filter((hit) => missing.has(hit.series))).toEqual([]);
});

test("pages through the hits twenty at a time with a cursor, each hit once and the count the same on every page", async () => {
  const { backend } = backendFor();
  const pages = [];

  let next: Parameters<FakeBackend["librarySearchChapters"]>[1] = null;
  do {
    const page = await backend.librarySearchChapters(
      chapterSearch("chapter"),
      next,
    );
    pages.push(page);
    next = page.next;
  } while (next !== null);

  const books = pages.flatMap((page) => page.hits.map((hit) => hit.book));
  const sizes = pages.map((page) => page.hits.length);
  expect([
    pages.length > 1,
    sizes.slice(0, -1).every((size) => size === 20),
    new Set(books).size === books.length,
    new Set(pages.map((page) => page.count)),
  ]).toEqual([true, true, true, new Set([books.length])]);
});

test("counts the hits as a number, the sample never exhausting the window of candidates the library examines", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySearchChapters(
    chapterSearch("chapter"),
    null,
  );

  expect(page.count).toBe((await everyChapterHit(backend, "chapter")).length);
});

test("finds no chapter for the Book format, as the library holds none of that format yet", async () => {
  const { backend } = backendFor();

  const page = await backend.librarySearchChapters(
    chapterSearch("harbour gate", { formats: ["book"] }),
    null,
  );

  expect(page).toEqual({ hits: [], next: null, count: 0 });
});

test("narrows the hits to the manga series for Manga and to the other series for Comic, whatever Book is chosen beside them", async () => {
  const { backend } = backendFor();
  const found = async (formats: LibraryFilter["formats"]) =>
    seriesTitlesOf(await everyChapterHit(backend, "harbour gate", { formats }));

  expect([
    await found(["manga"]),
    await found(["manga", "book"]),
    await found(["comic"]),
    await found(["comic", "book"]),
    await found(["comic", "manga"]),
  ]).toEqual([
    ["Sample Series 11"],
    ["Sample Series 11"],
    [LONG_TITLE],
    [LONG_TITLE],
    [LONG_TITLE, "Sample Series 11"],
  ]);
});

test("narrows the hits to the series with every book read when asked for finished ones", async () => {
  const { backend } = backendFor();

  const hits = await everyChapterHit(backend, "volume 2", {
    finished: "only",
  });

  expect(seriesTitlesOf(hits)).toEqual([
    "Sample Series 02",
    "Sample Series 09",
    "Sample Series 15",
    "Sample Series 17",
  ]);
});

test("narrows the hits to the series carrying one of the tags chosen", async () => {
  const { backend } = backendFor();

  const hits = await everyChapterHit(backend, "volume 3", { tags: ["Sea"] });

  expect(seriesTitlesOf(hits)).toEqual(["Sample Series 04", LONG_TITLE]);
});

test("narrows the hits to the series with a bookmarked page when Bookmarked is the only one", async () => {
  const { backend } = backendFor();
  await backend.bookmarkPages(sampleBookId(6, 2), [3], true);

  const hits = await everyChapterHit(backend, "volume 2", {
    bookmarked: "only",
  });

  expect(hits.map((hit) => hit.book)).toEqual([sampleBookId(6, 2)]);
});

test("narrows the hits to the series that are quick reads", async () => {
  const { backend } = backendFor();

  const hits = await everyChapterHit(backend, "volume 1", {
    smart: ["quickReads"],
  });

  expect(seriesTitlesOf(hits)).toEqual(["Sample Series 21"]);
});

test("leaves the adult series out of the hits once they are hidden", async () => {
  const { backend } = backendFor();
  const shown = await everyChapterHit(backend, "volume 2");
  await backend.setLibraryAdultContent({
    treatment: "hide",
    countsAgeRatings: true,
  });

  const hidden = await everyChapterHit(backend, "volume 2");

  expect([
    seriesTitlesOf(shown).includes("Sample Series 17"),
    seriesTitlesOf(hidden).includes("Sample Series 17"),
  ]).toEqual([true, false]);
});

test("leaves the hidden series out of the hits, the count and the cursor while screenshot mode is on", async () => {
  const { backend } = backendFor();
  const adult = new Set([13, 17].map(sampleSeriesId));
  const search = chapterSearch("volume", {
    unread: "only",
    formats: ["manga"],
  });
  const everyone = await backend.librarySearchChapters(search, null);
  await backend.setScreenshotMode(true);

  const first = await backend.librarySearchChapters(search, null);
  const second = await backend.librarySearchChapters(search, first.next);

  expect([
    everyone.count,
    [...first.hits, ...second.hits].filter((hit) => adult.has(hit.series)),
    [first.count, second.count],
    [first.hits.length, second.hits.length],
    second.next,
  ]).toEqual([47, [], [40, 40], [20, 20], null]);
});

test("suggests the words of a series title before those of a chapter title nearer the search", async () => {
  const { backend } = backendFor();

  expect(await backend.librarySpellingSuggestion("lettr")).toEqual({
    text: "letters",
    chapterOf: null,
  });
});

test("suggests the words of a chapter title without naming its series while screenshot mode is on", async () => {
  const { backend } = backendFor();
  await backend.setScreenshotMode(true);

  expect(await backend.librarySpellingSuggestion("harbor gat")).toEqual({
    text: "harbour gate",
    chapterOf: null,
  });
});

test("suggests no chapter title for a series whose books are none", async () => {
  const { backend } = backendFor("series=empty");

  expect(await backend.librarySpellingSuggestion("harbor gat")).toBeNull();
});

const MARKED_ADULT = {
  title: null,
  people: null,
  tags: null,
  summary: null,
  isMarkedAdult: true,
} as const;

async function markHarbourSeriesAdult(backend: FakeBackend) {
  for (const series of [11, 19]) {
    await backend.editSeriesDetails(sampleSeriesId(series), MARKED_ADULT);
  }
}

test("suggests no chapter title of an adult series the library hides", async () => {
  const { backend } = backendFor();
  await markHarbourSeriesAdult(backend);
  await backend.setLibraryAdultContent({
    treatment: "hide",
    countsAgeRatings: true,
  });

  expect(await backend.librarySpellingSuggestion("harbor gat")).toBeNull();
});

test("suggests a chapter title of an adult series the library shows", async () => {
  const { backend } = backendFor();
  await markHarbourSeriesAdult(backend);

  expect(await backend.librarySpellingSuggestion("harbor gat")).toEqual({
    text: "harbour gate",
    chapterOf: LONG_TITLE,
  });
});

test("suggests no chapter title of an adult series while screenshot mode is on, and one once it is off", async () => {
  const { backend } = backendFor();
  await backend.editSeriesDetails(sampleSeriesId(19), MARKED_ADULT);
  const shown = await backend.librarySpellingSuggestion("arrivl at");
  await backend.setScreenshotMode(true);

  const hidden = await backend.librarySpellingSuggestion("arrivl at");

  expect([shown, hidden]).toEqual([
    { text: "arrival at", chapterOf: LONG_TITLE },
    null,
  ]);
});

const LIGHTHOUSE_SERIES = "the lighthouse";
const MANGA_FORMAT = { formats: ["manga"] } satisfies Partial<LibraryFilter>;

async function searchedSeries(
  backend: FakeBackend,
  text: string,
  formats: LibraryFilter["formats"],
) {
  const search = { text, filter: { ...EVERY_SERIES, formats } };
  const page = await backend.librarySearch(null, search);
  return {
    titles: page.series.map((series) => series.title).toSorted(),
    count: await backend.librarySearchCount(search),
  };
}

test("finds no series by text for the Book format, as the library holds none of that format yet", async () => {
  const { backend } = backendFor();

  expect(await searchedSeries(backend, LIGHTHOUSE_SERIES, ["book"])).toEqual({
    titles: [],
    count: 0,
  });
});

test("finds a series by text for the Comic format when it holds no manga", async () => {
  const { backend } = backendFor();

  expect(await searchedSeries(backend, LIGHTHOUSE_SERIES, ["comic"])).toEqual({
    titles: [LONG_TITLE],
    count: 1,
  });
});

test("finds only the series holding manga by text for the Manga format, whatever Book is chosen beside it", async () => {
  const { backend } = backendFor();
  const manga = (await titlesFor(MANGA_FORMAT)).toSorted();

  expect([
    await searchedSeries(backend, "sample series", ["manga"]),
    await searchedSeries(backend, "sample series", ["manga", "book"]),
    await searchedSeries(backend, LIGHTHOUSE_SERIES, ["manga"]),
  ]).toEqual([
    { titles: manga, count: manga.length },
    { titles: manga, count: manga.length },
    { titles: [], count: 0 },
  ]);
});

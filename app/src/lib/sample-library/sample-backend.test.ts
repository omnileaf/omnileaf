import { expect, test } from "vitest";

import { type LibraryListing } from "#lib/ipc/bindings.ts";
import { CommandFailure } from "#lib/ipc/fake-backend.ts";

import { sampleBackend, scenarioFrom } from "./sample-backend.ts";
import { LONG_TITLE, sampleBookId, sampleSeriesId } from "./sample-library.ts";
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

  expect(titles).toHaveLength(20);
  expect(await backend.librarySeriesCount(NEW_LIBRARY_LISTING.filter)).toBe(20);
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
  expect(hidden).toHaveLength(18);
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
  expect(await backend.librarySeriesCount(NEWEST_FIRST.filter)).toBe(18);
  expect(found.series.map((series) => series.title)).not.toContain(
    "Sample Series 17",
  );
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
  const folder = folders[0]?.id;
  if (folder === undefined) {
    throw new Error("the sample library lists no folder");
  }

  const page = await backend.folderSeries(folder, null, NEWEST_FIRST);
  const count = await backend.folderSeriesCount(folder, NEWEST_FIRST.filter);
  const elsewhere = await backend.folderSeries(
    "another-folder",
    null,
    NEWEST_FIRST,
  );

  expect([page.series.length, count, elsewhere.series]).toEqual([20, 20, []]);
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
    title: { fromFile: "Sample Series 04", edited: null },
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
    edited: { fromFile: "Sample Series 04", edited: "The Harbour Gate" },
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

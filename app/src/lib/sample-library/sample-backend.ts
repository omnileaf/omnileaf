import {
  DEFAULT_LIBRARY_LISTING,
  DEFAULT_LIBRARY_VIEW,
  type Inclusion,
  type IpcErrorCode,
  type LibraryFilter,
  type LibraryListing,
  type LibraryView,
  type Platform,
} from "#lib/ipc/bindings.ts";
import { CommandFailure, type FakeBackend } from "#lib/ipc/fake-backend.ts";
import { isShownBy } from "#lib/series/books-shown.ts";

import {
  type SampleBook,
  type SampleFile,
  type SampleReading,
  type SampleSeries,
  sampleBookId,
  sampleLibrary,
  sampleSeriesId,
} from "./sample-library.ts";

type LibraryState = "ready" | "empty" | "loading" | "failed";
type SeriesState = "ready" | "loading" | "failed" | "empty";

export interface SampleScenario {
  readonly platform: Platform;
  readonly library: LibraryState;
  readonly series: SeriesState;
  readonly sixthVolume: SampleFile;
}

export interface SampleEvents {
  emit(event: string, payload: unknown): void;
}

const PLATFORMS = ["android", "ios", "macos", "windows", "linux"] as const;
const LIBRARY_STATES = ["ready", "empty", "loading", "failed"] as const;
const SERIES_STATES = ["ready", "loading", "failed", "empty"] as const;
const SIXTH_VOLUME_FILES = ["present", "missing", "damaged"] as const;

function oneOf<Choice extends string>(
  choices: readonly Choice[],
  asked: string | null,
  fallback: Choice,
): Choice {
  return choices.find((choice) => choice === asked) ?? fallback;
}

/** Reads the sample library's scenario from a page address, such as `?platform=ios&library=empty`. */
export function scenarioFrom(search: URLSearchParams): SampleScenario {
  return {
    platform: oneOf(PLATFORMS, search.get("platform"), "linux"),
    library: oneOf(LIBRARY_STATES, search.get("library"), "ready"),
    series: oneOf(SERIES_STATES, search.get("series"), "ready"),
    sixthVolume: oneOf(SIXTH_VOLUME_FILES, search.get("volume6"), "missing"),
  };
}

const PAGE_SIZE = 50;
const PAGE_WIDTH = 1000;
const PAGE_HEIGHT = 1500;
const LIBRARY_FOLDER_ID = "5a4d1e00-0000-4000-8002-000000000001";
const LIBRARY_FOLDER_NAME = "Sample Comics";
const LIBRARY_FOLDER_LOCATION = "/media/Sample Comics";
const NEWEST_ADDED_MS = Date.UTC(2026, 9, 14, 9);
const DAY_MS = 86_400_000;
const MINUTE = 60;
const SESSION_SECONDS = 25 * MINUTE;
const NEVER = new Promise<never>(() => undefined);

function failure(code: IpcErrorCode, message: string): CommandFailure {
  return new CommandFailure({ code, message });
}

function offsetFrom(cursor: string | null): number {
  return cursor === null ? 0 : Number(cursor);
}

function pageOf<Item>(
  items: readonly Item[],
  cursor: string | null,
): { readonly items: Item[]; readonly next: string | null } {
  const start = offsetFrom(cursor);
  const end = start + PAGE_SIZE;
  return {
    items: items.slice(start, end),
    next: end < items.length ? String(end) : null,
  };
}

function isRead(book: SampleBook): boolean {
  return book.reading.state === "read";
}

function isStarted(book: SampleBook): boolean {
  return book.reading.state !== "notStarted";
}

function admits(inclusion: Inclusion, holds: boolean): boolean {
  return inclusion === "any" || (inclusion === "only") === holds;
}

function passes(series: SampleSeries, filter: LibraryFilter): boolean {
  return (
    admits(
      filter.unread,
      series.books.some((book) => !isRead(book)),
    ) &&
    admits(filter.started, series.books.some(isStarted)) &&
    admits(filter.finished, series.books.every(isRead))
  );
}

function wireReading(reading: SampleReading) {
  return reading.state === "started"
    ? { state: "started" as const, page: reading.page }
    : reading;
}

function coverOf(series: SampleSeries): string {
  return `covers/${String(series.number)}-${String(series.art)}`;
}

function bookCoverOf(series: SampleSeries, number: number): string {
  return `covers/${String(series.number)}-${String(series.art)}-${String(number)}`;
}

/** Answers every command from the sample library, keeping what the reader marks or reads until the page reloads. */
export function sampleBackend(
  scenario: SampleScenario,
  events: SampleEvents,
): FakeBackend {
  const library: SampleSeries[] =
    scenario.library === "empty" ? [] : sampleLibrary(scenario.sixthVolume);
  let listing: LibraryListing = {
    ...DEFAULT_LIBRARY_LISTING,
    sort: { by: "dateAdded", direction: "descending" },
  };
  let view: LibraryView = DEFAULT_LIBRARY_VIEW;
  let isFullScreen = false;
  const bookmarks = new Map<string, Set<number>>();

  const addedAt = (series: SampleSeries): number =>
    NEWEST_ADDED_MS - library.indexOf(series) * DAY_MS;

  function sorted(chosen: LibraryListing): SampleSeries[] {
    const ordered = library
      .filter((series) => passes(series, chosen.filter))
      .toSorted((one, other) =>
        chosen.sort.by === "title"
          ? one.title.localeCompare(other.title)
          : addedAt(one) - addedAt(other),
      );
    return chosen.sort.direction === "ascending"
      ? ordered
      : ordered.toReversed();
  }

  function wireSeries(series: SampleSeries) {
    return {
      id: sampleSeriesId(series.number),
      title: series.title,
      bookCount: series.books.length,
      unreadCount: series.books.filter((book) => !isRead(book)).length,
      cover: coverOf(series),
    };
  }

  function seriesBy(creator: string): SampleSeries[] {
    return library.filter((series) =>
      series.creators.some(({ name }) => name === creator),
    );
  }

  function seriesWith(id: string): SampleSeries {
    const found = library.find(
      (series) => sampleSeriesId(series.number) === id,
    );
    if (found === undefined) {
      throw failure("seriesNotFound", "that series isn't in the library");
    }
    return found;
  }

  function bookWith(id: string): {
    readonly series: SampleSeries;
    readonly index: number;
  } {
    for (const series of library) {
      const index = series.books.findIndex(
        (_, at) => sampleBookId(series.number, at + 1) === id,
      );
      if (index !== -1) {
        return { series, index };
      }
    }
    throw failure("bookNotFound", "that book isn't in the library");
  }

  function setReading(id: string, reading: SampleReading): void {
    const { series, index } = bookWith(id);
    const books = series.books.map((book, at) =>
      at === index ? { ...book, reading } : book,
    );
    library[library.indexOf(series)] = { ...series, books };
  }

  function wireBook(series: SampleSeries, index: number) {
    const book = series.books[index];
    if (book === undefined) {
      throw failure("bookNotFound", "that book isn't in the library");
    }
    return {
      id: sampleBookId(series.number, index + 1),
      position: index + 1,
      title: book.title,
      addedAtMs: addedAt(series) - (series.books.length - index) * DAY_MS,
      reading: wireReading(book.reading),
      pageCount: book.pageCount,
      isBookmarked: book.isBookmarked,
      isNew: book.isNew,
    };
  }

  function neighbour(series: SampleSeries, index: number) {
    const book = series.books[index];
    return book === undefined
      ? null
      : {
          id: sampleBookId(series.number, index + 1),
          title: book.title,
          cover:
            book.file === "missing" ? null : bookCoverOf(series, index + 1),
          reading: wireReading(book.reading),
          pageCount: book.pageCount,
        };
  }

  function upNextOf(series: SampleSeries) {
    const index = series.books.findIndex((book) => !isRead(book));
    return index === -1 ? null : wireBook(series, index);
  }

  function historyEntries() {
    return library.flatMap((series) =>
      series.books.flatMap((book, index) =>
        book.reading.state === "started"
          ? [
              {
                book: sampleBookId(series.number, index + 1),
                bookTitle: book.title,
                series: sampleSeriesId(series.number),
                seriesTitle: series.title,
                position: index + 1,
                cover: bookCoverOf(series, index + 1),
                startedAtMs: addedAt(series),
                utcOffsetMinutes: 0,
                readSeconds: SESSION_SECONDS,
                readTo: {
                  state: "page" as const,
                  page: book.reading.page,
                  pageCount: book.pageCount,
                },
                reading: wireReading(book.reading),
                day: {
                  day: Math.floor(addedAt(series) / DAY_MS),
                  readSeconds: SESSION_SECONDS,
                },
              },
            ]
          : [],
      ),
    );
  }

  async function libraryReady(): Promise<void> {
    if (scenario.library === "loading") {
      await NEVER;
    }
    if (scenario.library === "failed") {
      throw failure("internal", "the library couldn't be read");
    }
  }

  function booksOf(series: SampleSeries): readonly SampleBook[] {
    return scenario.series === "empty" ? [] : series.books;
  }

  async function seriesReady(): Promise<void> {
    if (scenario.series === "loading") {
      await NEVER;
    }
    if (scenario.series === "failed") {
      throw failure("internal", "the series couldn't be read");
    }
  }

  return {
    appInfo: () => ({
      version: "0.1.0",
      platform: scenario.platform,
      sourceCode: "repo.example.org/omnileaf",
      isDevelopmentBuild: true,
    }),
    libraryProblem: () => null,
    addLibraryFolder: () => null,
    matchSystemBars: () => null,
    watchBackSwipes: () => null,
    allowBackSwipe: () => null,
    libraryFolders: () => ({
      folders:
        library.length === 0
          ? []
          : [
              {
                id: LIBRARY_FOLDER_ID,
                kind: "linked",
                name: LIBRARY_FOLDER_NAME,
                location: LIBRARY_FOLDER_LOCATION,
                isAvailable: true,
              },
            ],
      next: null,
    }),
    librarySeries: async (after, chosen) => {
      await libraryReady();
      const page = pageOf(sorted(chosen), after);
      return { series: page.items.map(wireSeries), next: page.next };
    },
    librarySeriesCount: async (filter) => {
      await libraryReady();
      return library.filter((series) => passes(series, filter)).length;
    },
    librarySearch: async (after, search) => {
      await libraryReady();
      const text = search.text.trim().toLocaleLowerCase();
      const found = sorted({ ...listing, filter: search.filter }).filter(
        (series) => series.title.toLocaleLowerCase().includes(text),
      );
      const page = pageOf(found, after);
      return { series: page.items.map(wireSeries), next: page.next };
    },
    librarySearchCount: async (search) => {
      await libraryReady();
      const text = search.text.trim().toLocaleLowerCase();
      return library.filter(
        (series) =>
          passes(series, search.filter) &&
          series.title.toLocaleLowerCase().includes(text),
      ).length;
    },
    seriesOverview: async (id) => {
      await seriesReady();
      const series = seriesWith(id);
      return {
        id,
        title: series.title,
        bookCount: booksOf(series).length,
        readCount: booksOf(series).filter(isRead).length,
        bookmarkCount: booksOf(series).filter((book) => book.isBookmarked)
          .length,
        cover: coverOf(series),
        folder: LIBRARY_FOLDER_NAME,
        upNext: booksOf(series).length === 0 ? null : upNextOf(series),
        format: series.format,
        creators: series.creators.map((creator) => ({
          ...creator,
          seriesCount: seriesBy(creator.name).length,
        })),
        summary: series.summary ?? null,
        tags: [...series.tags],
        related: series.related.map(({ number, reason }) => {
          const other = seriesWith(sampleSeriesId(number));
          return {
            id: sampleSeriesId(number),
            title: other.title,
            cover: coverOf(other),
            bookCount: other.books.length,
            readCount: other.books.filter(isRead).length,
            reason,
          };
        }),
      };
    },
    seriesBooks: async (id, chosen, after) => {
      await seriesReady();
      const series = seriesWith(id);
      const books = booksOf(series)
        .map((_, index) => wireBook(series, index))
        .filter((book) => isShownBy(chosen.shown, book));
      const ordered =
        chosen.direction === "ascending" ? books : books.toReversed();
      const page = pageOf(ordered, after);
      return { books: page.items, next: page.next };
    },
    creatorSeries: (creator) =>
      seriesBy(creator).map((series) => ({
        id: sampleSeriesId(series.number),
        title: series.title,
        cover: coverOf(series),
        role:
          series.creators.find(({ name }) => name === creator)?.role ?? null,
      })),
    markBooks: (books, mark) => {
      for (const id of books) {
        setReading(
          id,
          mark === "read" ? { state: "read" } : { state: "notStarted" },
        );
      }
      events.emit("library-changed", null);
      return null;
    },
    orientScreen: () => null,
    changeFullScreen: (change) => {
      isFullScreen = change === "toggle" ? !isFullScreen : false;
      return isFullScreen;
    },
    openBook: (id) => {
      const { series, index } = bookWith(id);
      const book = series.books[index];
      if (book === undefined || book.file === "missing") {
        throw failure("bookUnreadable", "the book's file is missing");
      }
      const number = index + 1;
      return {
        id,
        title: book.title,
        series: sampleSeriesId(series.number),
        seriesTitle: series.title,
        pages: Array.from({ length: book.pageCount }, (_, page) => {
          const path = `pages/${String(series.number)}-${String(series.art)}-${String(number)}-${String(page + 1)}`;
          return {
            path,
            thumbnail: `thumbnails/${path}`,
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          };
        }),
        startPage: book.reading.state === "started" ? book.reading.page - 1 : 0,
        reading: wireReading(book.reading),
        position: number,
        previous: neighbour(series, index - 1),
        next: neighbour(series, index + 1),
        readingDirection: series.readingDirection,
        bookmarkedPages: [...(bookmarks.get(id) ?? [])].toSorted(
          (one, other) => one - other,
        ),
      };
    },
    bookmarkPages: (id, pages, isBookmarked) => {
      const kept = bookmarks.get(id) ?? new Set<number>();
      for (const page of pages) {
        if (isBookmarked) {
          kept.add(page);
        } else {
          kept.delete(page);
        }
      }
      bookmarks.set(id, kept);
      return null;
    },
    readingRestored: () => null,
    pageShown: (id, page) => {
      const { series, index } = bookWith(id);
      const book = series.books[index];
      const isLastPage = book !== undefined && page >= book.pageCount;
      setReading(
        id,
        isLastPage ? { state: "read" } : { state: "started", page },
      );
      events.emit("reading-saved", {
        book: id,
        series: sampleSeriesId(series.number),
      });
      return null;
    },
    closeBook: () => null,
    readingHistory: (after) => {
      const page = pageOf(historyEntries(), after);
      return { entries: page.items, next: page.next };
    },
    readingWeek: () => ({
      readSeconds: historyEntries().length * SESSION_SECONDS,
      booksOpened: historyEntries().length,
      booksFinished: 0,
      daysInARow: 1,
    }),
    readingTimeBetween: () => historyEntries().length * SESSION_SECONDS,
    bookReadTime: () => SESSION_SECONDS,
    bookSessions: () => ({
      sessions: 1,
      readSeconds: SESSION_SECONDS,
      firstDay: Math.floor(NEWEST_ADDED_MS / DAY_MS),
      lastDay: Math.floor(NEWEST_ADDED_MS / DAY_MS),
    }),
    historySeries: () =>
      library
        .filter((series) => series.books.some(isStarted))
        .map((series) => ({
          id: sampleSeriesId(series.number),
          title: series.title,
        })),
    libraryListing: () => listing,
    setLibraryListing: (chosen) => {
      listing = chosen;
      return null;
    },
    libraryView: () => view,
    setLibraryView: (chosen) => {
      view = chosen;
      return null;
    },
    removeLibraryFolder: () => null,
    libraryFolderBookCount: () =>
      library.reduce((count, series) => count + series.books.length, 0),
    rescanLibraryFolder: () => ({
      id: LIBRARY_FOLDER_ID,
      name: LIBRARY_FOLDER_NAME,
      outcome: {
        kind: "rescanned",
        added: 0,
        updated: 0,
        moved: 0,
        removed: 0,
        unreadableBooks: 0,
        unsupportedBooks: 0,
        unreadableFolders: 0,
      },
    }),
    rescanLibraryFolders: () => [],
    removeBooksOfEmptiedFolder: () => ({ kind: "kept" }),
    firstLaunchFinished: () => true,
    finishFirstLaunch: () => null,
    setAppLanguage: () => null,
    setScheduledRescans: () => undefined,
    copyVersionDetails: () => null,
    openProjectLink: () => null,
    offerSavedCrashReport: () => null,
    offerInterfaceErrorReport: (error) => ({
      details: error.message,
      origin: "interface",
    }),
    sendCrashReport: () => null,
    copyCrashReport: () => null,
    declineCrashReport: () => null,
    panicInCore: () => null,
    crashAndQuit: () => null,
  };
}

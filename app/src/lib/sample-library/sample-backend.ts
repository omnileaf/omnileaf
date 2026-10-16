import {
  type AdultContent,
  DEFAULT_LIBRARY_VIEW,
  type DetailEdits,
  type FolderProblem,
  type Inclusion,
  type IpcErrorCode,
  type LibraryFilter,
  type LibraryListing,
  type LibrarySortBy,
  type LibraryView,
  type Platform,
  type SeriesFormat,
  type SignInOutcome,
  type SmartFilter,
} from "#lib/ipc/bindings.ts";
import { CommandFailure, type FakeBackend } from "#lib/ipc/fake-backend.ts";
import { NEW_ADULT_CONTENT } from "#lib/library/adult-content.ts";
import { NEW_LIBRARY_LISTING } from "#lib/library/library-listing.ts";
import { NEW_LIBRARY_TABS } from "#lib/library/library-tabs.ts";
import {
  closestWords,
  isTooShortToSuggest,
  slipsAllowed,
} from "./closest-words.ts";
import { isShownBy } from "#lib/series/books-shown.ts";

import {
  type SampleBook,
  type SampleCreator,
  type SampleFile,
  type SampleReading,
  type SampleSeries,
  sampleBookId,
  sampleLibrary,
  sampleSeriesId,
} from "./sample-library.ts";

type LibraryState = (typeof LIBRARY_STATES)[number];
type SeriesState = "ready" | "loading" | "failed" | "empty";

export interface SampleScenario {
  readonly platform: Platform;
  readonly library: LibraryState;
  readonly series: SeriesState;
  readonly sixthVolume: SampleFile;
  readonly missing: MissingKind;
  readonly signIn: SignInOutcome;
}

export interface SampleEvents {
  emit(event: string, payload: unknown): void;
}

const PLATFORMS = ["android", "ios", "macos", "windows", "linux"] as const;
const LIBRARY_STATES = [
  "ready",
  "empty",
  "loading",
  "failed",
  "thousands",
] as const;
const THOUSANDS_OF_SERIES = 12_480;
const SERIES_STATES = ["ready", "loading", "failed", "empty"] as const;
const SIXTH_VOLUME_FILES = ["present", "missing", "damaged"] as const;
const MISSING_KINDS = [
  "none",
  "folder",
  "drive",
  "access",
  "sign-in",
  "mount",
  "share",
] as const;

type MissingKind = (typeof MISSING_KINDS)[number];

const SIGN_IN_OUTCOMES = [
  "signedIn",
  "cancelled",
  "failed",
] as const satisfies readonly SignInOutcome[];
const SAMPLE_SYSTEMS = {
  android: "Android 16",
  ios: "iOS 26",
  macos: "macOS 26",
  windows: "Windows 11",
  linux: "Fedora 43",
} as const satisfies Record<Platform, string>;
const SAMPLE_LOG = [
  "INFO omnileaf_app: open the library",
  "INFO omnileaf_engine::scan: found 24 books in Folder 731",
  "WARN omnileaf_engine::scan: skip a book it couldn't read path=<path>",
  "WARN omnileaf_engine::pages: keep a transcoded page for next time error=disk full",
  "INFO omnileaf_engine::rescan: Series 68 gained a book",
];

const MISSING_FOLDER_ID = "5a4d1e00-0000-4000-8002-000000000002";
const MISSING_FOLDER_SERIES = new Set([3, 6, 9, 12, 15, 18]);
const NAS_MANGA = { server: "nas", name: "nas/manga" };
const MISSING_FOLDERS = {
  folder: {
    name: "Comics",
    location: "/media/Comics",
    problem: { kind: "missing" },
  },
  drive: {
    name: "Comics",
    location: "/Volumes/Archive/Comics",
    problem: { kind: "driveDisconnected" },
  },
  access: {
    name: "Manga",
    location: "Internal storage › Manga",
    problem: { kind: "lostAccess" },
  },
  "sign-in": {
    name: "Manga",
    location: "/run/user/1000/gvfs/smb-share:server=nas,share=manga",
    problem: { kind: "needsSignIn", share: NAS_MANGA },
  },
  mount: {
    name: "Manga",
    location: "/mnt/manga",
    problem: { kind: "needsMounting", share: NAS_MANGA },
  },
  share: {
    name: "Manga",
    location: "nas › Manga",
    problem: { kind: "shareUnreachable", share: NAS_MANGA },
  },
} as const satisfies Record<
  Exclude<MissingKind, "none">,
  { name: string; location: string; problem: FolderProblem }
>;
const DAMAGED_PAGES_LOST = 6;

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
    missing: oneOf(MISSING_KINDS, search.get("missing"), "none"),
    signIn: oneOf(SIGN_IN_OUTCOMES, search.get("signin"), "signedIn"),
  };
}

const PAGE_SIZE = 50;
const SAMPLE_SECONDS_PER_PAGE = 8.5;
const SAMPLE_SUMMARY_SECONDS_PER_PAGE = 22.5;
const PAGE_WIDTH = 1000;
const PAGE_HEIGHT = 1500;
const STRIP_WIDTH = 800;
const STRIP_HEIGHT = 2400;
const LIBRARY_FOLDER_ID = "5a4d1e00-0000-4000-8002-000000000001";
const LIBRARY_FOLDER_NAME = "Sample Comics";
const LIBRARY_FOLDER_LOCATION = "/media/Sample Comics";
const NEWEST_ADDED_MS = Date.UTC(2026, 9, 14, 9);
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const HOURS_AGO_READ = [2, 14, 26, 31, 75, 99];
const MINUTE = 60;
const SESSION_SECONDS = 25 * MINUTE;
const NEVER = new Promise<never>(() => undefined);

function libraryFor(scenario: SampleScenario): SampleSeries[] {
  if (scenario.library === "empty") {
    return [];
  }
  const shelf = sampleLibrary(scenario.sixthVolume);
  if (scenario.library !== "thousands") {
    return shelf;
  }
  const more = Array.from(
    { length: THOUSANDS_OF_SERIES - shelf.length },
    (_, index) => shelf.length + index + 1,
  );
  return [
    ...shelf,
    ...more.flatMap((number) => {
      const base = shelf[(number - 1) % shelf.length];
      return base === undefined
        ? []
        : [
            {
              ...base,
              number,
              title: `Sample Series ${String(number).padStart(5, "0")}`,
            },
          ];
    }),
  ];
}

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

function isOneOf<T>(chosen: readonly T[], value: T | null): boolean {
  return chosen.length === 0 || (value !== null && chosen.includes(value));
}

function formatOf(series: SampleSeries): SeriesFormat {
  if (series.number % COMICS_EVERY === 0) {
    return "comic";
  }
  return MANGA_FORMATS.has(series.format) ? "manga" : "book";
}

function languageOf(series: SampleSeries): string | null {
  return SAMPLE_LANGUAGES[series.number % SAMPLE_LANGUAGES.length] ?? null;
}

interface SeriesFacts {
  readonly isBookmarked: (series: SampleSeries) => boolean;
  readonly tagsOf: (series: SampleSeries) => readonly string[];
  readonly isAdult: (series: SampleSeries) => boolean;
  readonly hidesAdult: () => boolean;
  readonly isOutOfReach: (series: SampleSeries) => boolean;
}

function passes(
  series: SampleSeries,
  filter: LibraryFilter,
  { isBookmarked, tagsOf, isAdult, hidesAdult, isOutOfReach }: SeriesFacts,
): boolean {
  return (
    !isOutOfReach(series) &&
    !(hidesAdult() && isAdult(series)) &&
    admits(
      filter.unread,
      series.books.some((book) => !isRead(book)),
    ) &&
    admits(filter.started, series.books.some(isStarted)) &&
    admits(filter.finished, series.books.every(isRead)) &&
    isOneOf(filter.formats, formatOf(series)) &&
    isOneOf(filter.languages, languageOf(series)) &&
    (filter.tags.length === 0 ||
      tagsOf(series).some((tag) => filter.tags.includes(tag))) &&
    admits(filter.adult, isAdult(series)) &&
    admits(filter.bookmarked, isBookmarked(series)) &&
    filter.smart.every((smart) => SMART_FILTERS[smart](series))
  );
}

interface SampleCategory {
  readonly id: string;
  readonly name: string;
  readonly holds: (series: SampleSeries) => boolean;
}

const SAMPLE_LANGUAGES = ["ja", "ja", "en", "fr", "ja", "en", "de"] as const;
const SERIES_WITH_DOWNLOADS = new Set([1, 4, 6, 15]);
const ADULT_SERIES = new Set([13, 17]);
const SMART_FILTERS: Record<SmartFilter, (series: SampleSeries) => boolean> = {
  quickReads: (series) => [4, 7, 16, 18].includes(series.number),
  forgotten: (series) => [9, 12, 17].includes(series.number),
  duplicates: (series) => [5, 14].includes(series.number),
  readyToCleanUp: (series) =>
    SERIES_WITH_DOWNLOADS.has(series.number) && series.books.every(isRead),
};
const FORMATS: readonly SeriesFormat[] = ["comic", "manga", "book"];
const COMICS_EVERY = 3;
const MANGA_FORMATS: ReadonlySet<string> = new Set(["Manga", "Webtoon"]);
const SUGGESTED_TAGS = 3;
const FAVOURITES_EVERY = 5;
const FAVOURITE_REMAINDER = 4;

const SAMPLE_CATEGORIES: readonly SampleCategory[] = [
  {
    id: "reading",
    name: "Reading",
    holds: (series) =>
      series.books.some(isStarted) && !series.books.every(isRead),
  },
  {
    id: "manga",
    name: "Manga",
    holds: (series) => series.format === "Manga",
  },
  {
    id: "comics",
    name: "Comics",
    holds: (series) => series.number % COMICS_EVERY === 0,
  },
  {
    id: "plan-to-read",
    name: "Plan to read",
    holds: (series) => !series.books.some(isStarted),
  },
  {
    id: "favourites",
    name: "Favourites",
    holds: (series) => series.number % FAVOURITES_EVERY === FAVOURITE_REMAINDER,
  },
  {
    id: "seinen",
    name: "Seinen",
    holds: (series) => series.tags.includes("Seinen"),
  },
  {
    id: "sea-stories",
    name: "Sea stories",
    holds: (series) => series.tags.includes("Sea"),
  },
];

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
  const library: SampleSeries[] = libraryFor(scenario);
  let listing: LibraryListing = {
    ...NEW_LIBRARY_LISTING,
    sort: { by: "dateAdded", direction: "descending" },
  };
  let view: LibraryView = DEFAULT_LIBRARY_VIEW;
  let isFullScreen = false;
  const bookmarks = new Map<string, Set<number>>();
  const readingBeforeMarked = new Map<string, SampleReading>();

  const categoriesCreated: { readonly id: string; readonly name: string }[] =
    [];
  const categoryChanges = new Map<
    string,
    { readonly added: Set<number>; readonly removed: Set<number> }
  >();
  const tagChanges = new Map<
    number,
    { readonly added: Set<string>; readonly removed: Set<string> }
  >();
  const detailEdits = new Map<number, DetailEdits>();
  const titleOf = (series: SampleSeries): string =>
    detailEdits.get(series.number)?.title ?? series.title;
  const peopleOf = (series: SampleSeries): readonly SampleCreator[] =>
    detailEdits.get(series.number)?.people ?? series.creators;

  function categoryChangesOf(category: string) {
    const changes = categoryChanges.get(category) ?? {
      added: new Set<number>(),
      removed: new Set<number>(),
    };
    categoryChanges.set(category, changes);
    return changes;
  }

  function tagChangesOf(series: number) {
    const changes = tagChanges.get(series) ?? {
      added: new Set<string>(),
      removed: new Set<string>(),
    };
    tagChanges.set(series, changes);
    return changes;
  }

  const tagsOf = (series: SampleSeries): readonly string[] => {
    const changes = tagChanges.get(series.number);
    const fromDetails = detailEdits.get(series.number)?.tags ?? series.tags;
    return [
      ...fromDetails.filter((tag) => changes?.removed.has(tag) !== true),
      ...[...(changes?.added ?? [])].filter(
        (tag) => !fromDetails.includes(tag),
      ),
    ];
  };

  function everyCategory(): { readonly id: string; readonly name: string }[] {
    return [
      ...SAMPLE_CATEGORIES.map(({ id, name }) => ({ id, name })),
      ...categoriesCreated,
    ];
  }

  function categoryHolds(category: string): (series: SampleSeries) => boolean {
    const rule = SAMPLE_CATEGORIES.find(({ id }) => id === category)?.holds;
    return (series) => {
      const changes = categoryChanges.get(category);
      if (changes?.removed.has(series.number) === true) {
        return false;
      }
      return (
        changes?.added.has(series.number) === true || rule?.(series) === true
      );
    };
  }

  const isBookmarked = (series: SampleSeries): boolean =>
    series.books.some(
      (_, index) =>
        (bookmarks.get(sampleBookId(series.number, index + 1))?.size ?? 0) > 0,
    );
  let adultContent: AdultContent = NEW_ADULT_CONTENT;
  let libraryTabs: Parameters<FakeBackend["setLibraryTabs"]>[0] = [
    ...NEW_LIBRARY_TABS,
  ];
  const isAdult = (series: SampleSeries): boolean =>
    (adultContent.countsAgeRatings && ADULT_SERIES.has(series.number)) ||
    detailEdits.get(series.number)?.isMarkedAdult === true;
  const hidesAdult = (): boolean => adultContent.treatment === "hide";
  const missingFolder = {
    isFound: scenario.missing === "none",
    isShownAnyway: false,
  };
  const isOutOfReach = (series: SampleSeries): boolean =>
    !missingFolder.isFound &&
    !missingFolder.isShownAnyway &&
    MISSING_FOLDER_SERIES.has(series.number);
  const facts: SeriesFacts = {
    isBookmarked,
    tagsOf,
    isAdult,
    hidesAdult,
    isOutOfReach,
  };

  function missingFolderOf(kind: Exclude<MissingKind, "none">) {
    const { name, location } = MISSING_FOLDERS[kind];
    return {
      id: MISSING_FOLDER_ID,
      kind: "linked" as const,
      name,
      location,
      isAvailable: missingFolder.isFound,
    };
  }

  function hiddenSeries(): number {
    return library.filter(isOutOfReach).length;
  }

  const addedAt = (series: SampleSeries): number =>
    NEWEST_ADDED_MS - library.indexOf(series) * DAY_MS;

  const lastReadAt = (series: SampleSeries): number =>
    series.books.some((book) => book.reading.state === "started")
      ? addedAt(series)
      : 0;

  const unreadCountOf = (series: SampleSeries): number =>
    series.books.filter((book) => !isRead(book)).length;

  const updatedAt = (series: SampleSeries): number =>
    series.books.some((book) => book.isNew)
      ? NEWEST_ADDED_MS + DAY_MS
      : addedAt(series);

  const ORDERS = {
    title: (one, other) => one.title.localeCompare(titleOf(other)),
    dateAdded: (one, other) => addedAt(one) - addedAt(other),
    lastRead: (one, other) => lastReadAt(one) - lastReadAt(other),
    lastUpdated: (one, other) => updatedAt(one) - updatedAt(other),
    unreadCount: (one, other) => unreadCountOf(one) - unreadCountOf(other),
    timeLeft: (one, other) => secondsLeftIn(one) - secondsLeftIn(other),
  } satisfies Record<
    LibrarySortBy,
    (one: SampleSeries, other: SampleSeries) => number
  >;

  function sorted(chosen: LibraryListing): SampleSeries[] {
    const ordered = library
      .filter((series) => passes(series, chosen.filter, facts))
      .toSorted(ORDERS[chosen.sort.by]);
    return chosen.sort.direction === "ascending"
      ? ordered
      : ordered.toReversed();
  }

  function continuesFrom(series: SampleSeries): string | null {
    const index = series.books.findIndex((book) => !isRead(book));
    return index === -1 || !series.books.some(isStarted)
      ? null
      : sampleBookId(series.number, index + 1);
  }

  function wireSeries(series: SampleSeries) {
    return {
      id: sampleSeriesId(series.number),
      title: titleOf(series),
      bookCount: series.books.length,
      unreadCount: unreadCountOf(series),
      cover: coverOf(series),
      language: languageOf(series),
      hasDownloads: SERIES_WITH_DOWNLOADS.has(series.number),
      continuesFrom: continuesFrom(series),
      isAdult: isAdult(series),
    };
  }

  function seriesBy(creator: string): SampleSeries[] {
    return library.filter((series) =>
      peopleOf(series).some(({ name }) => name === creator),
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
      isFileMissing: book.file === "missing",
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

  function secondsLeftIn(series: SampleSeries): number {
    const pagesLeft = series.books.reduce((pages, book) => {
      if (isRead(book)) {
        return pages;
      }
      const readUpTo = book.reading.state === "started" ? book.reading.page : 0;
      return pages + book.pageCount - readUpTo;
    }, 0);
    return Math.round(pagesLeft * SAMPLE_SECONDS_PER_PAGE);
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
                seriesTitle: titleOf(series),
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

  const hiddenFromHistory = new Map<string, number>();
  let historyClearedAt: number | null = null;

  function hoursAgoRead(rank: number): number {
    const last = HOURS_AGO_READ.length - 1;
    return (
      HOURS_AGO_READ[rank] ?? (HOURS_AGO_READ[last] ?? 0) + (rank - last) * 24
    );
  }

  function lastFinished(series: SampleSeries) {
    const index = series.books.findLastIndex((book) => isRead(book));
    const book = series.books[index];
    if (book === undefined) {
      return [];
    }
    return [
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
        readTo: { state: "end" as const },
        reading: wireReading(book.reading),
        day: {
          day: Math.floor(addedAt(series) / DAY_MS),
          readSeconds: SESSION_SECONDS,
        },
      },
    ];
  }

  function booksRead(matching: string) {
    const now = Date.now();
    const typed = matching.trim().toLocaleLowerCase();
    const started = new Set(historyEntries().map(({ series }) => series));
    return [
      ...historyEntries(),
      ...library
        .filter((series) => !started.has(sampleSeriesId(series.number)))
        .flatMap(lastFinished),
    ]
      .map((entry, rank) => {
        const startedAtMs = now - hoursAgoRead(rank) * HOUR_MS;
        const utcOffsetMinutes = -new Date(startedAtMs).getTimezoneOffset();
        return {
          ...entry,
          startedAtMs,
          utcOffsetMinutes,
          day: {
            day: Math.floor(
              (startedAtMs + utcOffsetMinutes * MINUTE_MS) / DAY_MS,
            ),
            readSeconds: SESSION_SECONDS,
          },
        };
      })
      .filter(
        (entry) =>
          entry.startedAtMs > (historyClearedAt ?? -1) &&
          entry.startedAtMs > (hiddenFromHistory.get(entry.book) ?? -1) &&
          (typed === "" ||
            entry.seriesTitle.toLocaleLowerCase().includes(typed) ||
            entry.bookTitle.toLocaleLowerCase().includes(typed)),
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
              ...(scenario.missing === "none"
                ? []
                : [missingFolderOf(scenario.missing)]),
            ],
      next: null,
    }),
    missingLibraryFolders: () =>
      scenario.missing === "none" || missingFolder.isFound
        ? []
        : [
            {
              folder: missingFolderOf(scenario.missing),
              problem: MISSING_FOLDERS[scenario.missing].problem,
              hiddenSeries: MISSING_FOLDER_SERIES.size,
              isShownAnyway: missingFolder.isShownAnyway,
            },
          ],
    libraryHiddenSeriesCount: hiddenSeries,
    showMissingLibraryFolder: (_id, isShown) => {
      missingFolder.isShownAnyway = isShown;
      events.emit("library-changed", null);
      return null;
    },
    showSeriesInFolder: () => null,
    signInToLibraryFolder: () => {
      if (scenario.signIn === "signedIn") {
        missingFolder.isFound = true;
        events.emit("library-changed", null);
      }
      return scenario.signIn;
    },
    relocateLibraryFolder: (id) => {
      const name =
        scenario.missing === "none"
          ? ""
          : MISSING_FOLDERS[scenario.missing].name;
      const isShareChosenAgain = scenario.missing === "share";
      if (isShareChosenAgain && scenario.signIn === "cancelled") {
        return null;
      }
      if (isShareChosenAgain && scenario.signIn === "failed") {
        return { id, name, outcome: { kind: "unreachable" } };
      }
      missingFolder.isFound = true;
      events.emit("library-changed", null);
      return {
        id,
        name,
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
      };
    },
    librarySeries: async (after, chosen) => {
      await libraryReady();
      const page = pageOf(sorted(chosen), after);
      return { series: page.items.map(wireSeries), next: page.next };
    },
    librarySeriesCount: async (filter) => {
      await libraryReady();
      return library.filter((series) => passes(series, filter, facts)).length;
    },
    libraryCategories: async () => {
      await libraryReady();
      return library.length === 0 ? [] : everyCategory();
    },
    seriesLabels: async (series) => {
      await libraryReady();
      const chosen = series.map(seriesWith);
      const holding = (holds: (one: SampleSeries) => boolean) =>
        chosen.filter(holds).length;
      const libraryTags = [...new Set(library.flatMap(tagsOf))];
      const tags = libraryTags
        .map((tag) => ({
          tag,
          holding: holding((one) => tagsOf(one).includes(tag)),
        }))
        .filter((held) => held.holding > 0);
      return {
        keepsLabels: true,
        categories: everyCategory().map((category) => ({
          category,
          holding: holding(categoryHolds(category.id)),
        })),
        tags,
        suggestedTags: libraryTags
          .filter((tag) => !tags.some((held) => held.tag === tag))
          .slice(0, SUGGESTED_TAGS),
      };
    },
    keepsDetailEdits: async () => {
      await libraryReady();
      return true;
    },
    seriesDetails: async (id) => {
      await seriesReady();
      const series = seriesWith(id);
      const edits = detailEdits.get(series.number);
      return {
        title: { fromFile: series.title, edited: edits?.title ?? null },
        people: {
          fromFile: [...series.creators],
          edited: edits?.people ?? null,
        },
        tags: { fromFile: [...series.tags], edited: edits?.tags ?? null },
        summary: {
          fromFile: series.summary ?? null,
          edited: edits?.summary ?? null,
        },
        isMarkedAdult: edits?.isMarkedAdult ?? false,
        isRatedAdult: ADULT_SERIES.has(series.number),
      };
    },
    editSeriesDetails: async (id, edits) => {
      await seriesReady();
      detailEdits.set(seriesWith(id).number, edits);
      events.emit("library-changed", null);
      return null;
    },
    labelSeries: async (series, changes) => {
      await libraryReady();
      const numbers = series.map((id) => seriesWith(id).number);
      const created = changes.categoriesCreated.map((name) => {
        const category = {
          id: `created-${String(categoriesCreated.length)}`,
          name,
        };
        categoriesCreated.push(category);
        return category.id;
      });
      for (const category of [...changes.categoriesAdded, ...created]) {
        const { added, removed } = categoryChangesOf(category);
        for (const number of numbers) {
          added.add(number);
          removed.delete(number);
        }
      }
      for (const category of changes.categoriesRemoved) {
        const { added, removed } = categoryChangesOf(category);
        for (const number of numbers) {
          removed.add(number);
          added.delete(number);
        }
      }
      for (const number of numbers) {
        const { added, removed } = tagChangesOf(number);
        for (const tag of changes.tagsAdded) {
          added.add(tag);
          removed.delete(tag);
        }
        for (const tag of changes.tagsRemoved) {
          removed.add(tag);
          added.delete(tag);
        }
      }
      events.emit("library-changed", null);
      return null;
    },
    libraryTabs: () => [...libraryTabs],
    setLibraryTabs: (tabs) => {
      libraryTabs = tabs;
      return null;
    },
    libraryTags: async () => {
      await libraryReady();
      const counts = new Map<string, number>();
      for (const series of library) {
        for (const tag of tagsOf(series)) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
      return [...counts].map(([name, seriesCount]) => ({ name, seriesCount }));
    },
    renameLibraryTag: async (tag, to) => {
      await libraryReady();
      for (const series of library.filter((one) => tagsOf(one).includes(tag))) {
        const { added, removed } = tagChangesOf(series.number);
        removed.add(tag);
        added.delete(tag);
        added.add(to);
        removed.delete(to);
      }
      events.emit("library-changed", null);
      return null;
    },
    removeLibraryTag: async (tag) => {
      await libraryReady();
      const carrying = library.filter((one) => tagsOf(one).includes(tag));
      for (const series of carrying) {
        const { added, removed } = tagChangesOf(series.number);
        removed.add(tag);
        added.delete(tag);
      }
      events.emit("library-changed", null);
      return carrying.map((series) => sampleSeriesId(series.number));
    },
    libraryFilterChoices: async () => {
      await libraryReady();
      return {
        formats: FORMATS.filter((format) =>
          library.some((series) => formatOf(series) === format),
        ),
        languages: [
          ...new Set(
            library
              .toSorted((one, other) => one.number - other.number)
              .flatMap((series) => languageOf(series) ?? []),
          ),
        ],
        tags: [...new Set(library.flatMap(tagsOf))],
        ratesAdult: library.length > 0,
        keepsBookmarks: library.length > 0,
        smart: library.some((series) =>
          SERIES_WITH_DOWNLOADS.has(series.number),
        )
          ? ["quickReads", "forgotten", "duplicates", "readyToCleanUp"]
          : library.length > 0
            ? ["quickReads", "forgotten", "duplicates"]
            : [],
      };
    },
    categorySeries: async (category, after, chosen) => {
      await libraryReady();
      const page = pageOf(
        sorted(chosen).filter(categoryHolds(category)),
        after,
      );
      return { series: page.items.map(wireSeries), next: page.next };
    },
    categorySeriesCount: async (category, filter) => {
      await libraryReady();
      const holds = categoryHolds(category);
      return library.filter(
        (series) => passes(series, filter, facts) && holds(series),
      ).length;
    },
    folderSeries: async (folder, after, chosen) => {
      await libraryReady();
      const page = pageOf(
        folder === LIBRARY_FOLDER_ID ? sorted(chosen) : [],
        after,
      );
      return { series: page.items.map(wireSeries), next: page.next };
    },
    folderSeriesCount: async (folder, filter) => {
      await libraryReady();
      return folder === LIBRARY_FOLDER_ID
        ? library.filter((series) => passes(series, filter, facts)).length
        : 0;
    },
    librarySearch: async (after, search) => {
      await libraryReady();
      const text = search.text.trim().toLocaleLowerCase();
      const found = sorted({ ...listing, filter: search.filter }).filter(
        (series) => titleOf(series).toLocaleLowerCase().includes(text),
      );
      const page = pageOf(found, after);
      return { series: page.items.map(wireSeries), next: page.next };
    },
    librarySpellingSuggestion: async (text) => {
      await libraryReady();
      const typed = text.trim().toLocaleLowerCase().split(/\s+/u).join(" ");
      if (isTooShortToSuggest(typed)) {
        return null;
      }
      const allowed = slipsAllowed(Array.from(typed).length);
      const titles = library.flatMap((series) => [
        { title: titleOf(series), chapterOf: null },
        ...series.books.map((book) => ({
          title: book.title,
          chapterOf: titleOf(series),
        })),
      ]);
      let best: {
        slips: number;
        text: string;
        chapterOf: string | null;
      } | null = null;
      for (const { title, chapterOf } of titles) {
        const closest = closestWords(typed, title.toLocaleLowerCase());
        if (
          closest !== undefined &&
          closest.slips > 0 &&
          closest.slips <= allowed &&
          (best === null || closest.slips < best.slips)
        ) {
          best = { slips: closest.slips, text: closest.words, chapterOf };
        }
      }
      return best === null
        ? null
        : { text: best.text, chapterOf: best.chapterOf };
    },
    librarySearchCount: async (search) => {
      await libraryReady();
      const text = search.text.trim().toLocaleLowerCase();
      return library.filter(
        (series) =>
          passes(series, search.filter, facts) &&
          titleOf(series).toLocaleLowerCase().includes(text),
      ).length;
    },
    seriesOverview: async (id) => {
      await seriesReady();
      const series = seriesWith(id);
      return {
        id,
        title: titleOf(series),
        bookCount: booksOf(series).length,
        readCount: booksOf(series).filter(isRead).length,
        bookmarkCount: booksOf(series).filter((book) => book.isBookmarked)
          .length,
        cover: coverOf(series),
        folder: LIBRARY_FOLDER_NAME,
        upNext: booksOf(series).length === 0 ? null : upNextOf(series),
        format: series.format,
        creators: peopleOf(series).map((creator) => ({
          ...creator,
          seriesCount: seriesBy(creator.name).length,
        })),
        summary:
          detailEdits.get(series.number)?.summary ?? series.summary ?? null,
        tags: [...tagsOf(series)],
        secondsLeft: secondsLeftIn(series),
        related: series.related.map(({ number, reason }) => {
          const other = seriesWith(sampleSeriesId(number));
          return {
            id: sampleSeriesId(number),
            title: titleOf(other),
            cover: coverOf(other),
            bookCount: other.books.length,
            readCount: other.books.filter(isRead).length,
            reason,
            isAdult: isAdult(other),
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
        title: titleOf(series),
        cover: coverOf(series),
        role:
          peopleOf(series).find(({ name }) => name === creator)?.role ?? null,
      })),
    markBooks: (books, mark) => {
      for (const id of books) {
        setReading(
          id,
          mark === "read"
            ? { state: "read" }
            : (readingBeforeMarked.get(id) ?? { state: "notStarted" }),
        );
        readingBeforeMarked.delete(id);
      }
      events.emit("library-changed", null);
      return null;
    },
    markSeriesRead: (series) => {
      const marked = series.flatMap((id) => {
        const chosen = seriesWith(id);
        return chosen.books.flatMap((book, index) => {
          if (isRead(book)) {
            return [];
          }
          const bookId = sampleBookId(chosen.number, index + 1);
          readingBeforeMarked.set(bookId, book.reading);
          setReading(bookId, { state: "read" });
          return [bookId];
        });
      });
      events.emit("library-changed", null);
      return marked;
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
      const isDamaged = book.file === "damaged";
      const readablePages = isDamaged
        ? book.pageCount - DAMAGED_PAGES_LOST
        : book.pageCount;
      return {
        id,
        title: book.title,
        series: sampleSeriesId(series.number),
        seriesTitle: titleOf(series),
        pages: Array.from({ length: readablePages }, (_, page) => {
          const path = `${series.isStrip ? "strips" : "pages"}/${String(series.number)}-${String(series.art)}-${String(number)}-${String(page + 1)}`;
          return {
            path,
            thumbnail: `thumbnails/${path}`,
            size: series.isStrip
              ? { width: STRIP_WIDTH, height: STRIP_HEIGHT }
              : { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          };
        }),
        startPage: book.reading.state === "started" ? book.reading.page - 1 : 0,
        reading: wireReading(book.reading),
        position: number,
        previous: neighbour(series, index - 1),
        next: neighbour(series, index + 1),
        readingDirection: series.readingDirection,
        damage: isDamaged
          ? { promisedPages: book.pageCount, cause: "archiveEndsEarly" }
          : null,
        bookmarkedPages: [...(bookmarks.get(id) ?? [])].toSorted(
          (one, other) => one - other,
        ),
        secondsPerPage: Math.round(SAMPLE_SECONDS_PER_PAGE),
      };
    },
    bookPlace: (id) => {
      for (const series of library) {
        const index = series.books.findIndex(
          (_, at) => sampleBookId(series.number, at + 1) === id,
        );
        const book = series.books[index];
        if (book !== undefined) {
          return {
            id,
            title: book.title,
            series: sampleSeriesId(series.number),
            seriesTitle: titleOf(series),
          };
        }
      }
      return null;
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
    readingHistory: async (after, of) => {
      await libraryReady();
      const page = pageOf(
        of.kind === "books" ? booksRead(of.matching) : historyEntries(),
        after,
      );
      return { entries: page.items, next: page.next };
    },
    removeFromHistory: (book) => {
      const mark = hiddenFromHistory.get(book) ?? null;
      hiddenFromHistory.set(book, Date.now());
      return mark;
    },
    restoreToHistory: (book, mark) => {
      if (mark === null) {
        hiddenFromHistory.delete(book);
      } else {
        hiddenFromHistory.set(book, mark);
      }
      return null;
    },
    clearHistory: () => {
      const mark = historyClearedAt;
      historyClearedAt = Date.now();
      return mark;
    },
    restoreHistory: (mark) => {
      historyClearedAt = mark;
      return null;
    },
    readingWeek: () => ({
      readSeconds: historyEntries().length * SESSION_SECONDS,
      booksOpened: historyEntries().length,
      booksFinished: 0,
      daysInARow: 1,
    }),
    readingTimeBetween: () => historyEntries().length * SESSION_SECONDS,
    bookReadTime: () => SESSION_SECONDS,
    readingSummary: (id) => {
      const { series, index } = bookWith(id);
      const book = series.books[index];
      if (book === undefined || book.reading.state === "notStarted") {
        return null;
      }
      return {
        readSeconds: Math.round(
          book.pageCount * SAMPLE_SUMMARY_SECONDS_PER_PAGE,
        ),
        pageCount: book.pageCount,
        secondsPerPage: Math.ceil(SAMPLE_SUMMARY_SECONDS_PER_PAGE),
      };
    },
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
          title: titleOf(series),
        })),
    libraryListing: () => listing,
    setLibraryListing: (chosen) => {
      listing = chosen;
      return null;
    },
    libraryAdultContent: () => adultContent,
    setLibraryAdultContent: (chosen) => {
      adultContent = chosen;
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
    problemReport: () => ({
      version: "0.1.0",
      system: SAMPLE_SYSTEMS[scenario.platform],
      log: SAMPLE_LOG,
    }),
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

import type { Locator, Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import type {
  CrashReportOffer,
  LibraryProblem,
  Platform,
} from "../../src/lib/ipc/bindings.ts";
import javascript from "../../src/lib/licences/javascript.json" with { type: "json" };
import { licensedPackages } from "../../src/lib/licences/licences.ts";
import rust from "../../src/lib/licences/rust.json" with { type: "json" };
import { sampleArt } from "../../src/lib/sample-library/sample-art.ts";
import {
  sampleBackend,
  scenarioFrom,
} from "../../src/lib/sample-library/sample-backend.ts";
import {
  LONG_TITLE,
  sampleLibrary,
  sampleSeriesId,
} from "../../src/lib/sample-library/sample-library.ts";
import { searchQuery } from "../../src/lib/search/search-route.ts";
import {
  CommandFailure,
  commandsAsked,
  type FakeBackend,
  fakeProtocolPath,
  fakeProtocolRoute,
} from "./fake-backend.ts";
import {
  expect,
  fakeAppInfo,
  framesPassed,
  onPlatform,
  settle,
} from "./fixtures.ts";
import { goToStep } from "./first-launch-steps.ts";
import { LONG_FOLDER_NAME, longFoldersOn } from "./long-folders.ts";
import {
  BOOK_ID,
  NOT_STARTED,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";
import { sampleSeries, type WireSeries } from "./series-catalog.ts";

type Shown = (page: Page) => Locator;

export interface Screen {
  readonly name: string;
  readonly backend: (platform: Platform) => FakeBackend;
  readonly prepare?: (page: Page) => Promise<void>;
  readonly open: (page: Page) => Promise<void>;
  readonly shows: readonly Shown[];
}

type WireEntry = Awaited<
  ReturnType<FakeBackend["readingHistory"]>
>["entries"][number];

const UNBROKEN_SERIES_TITLE =
  "Sample_Series_Scanned_From_The_Collectors_Edition_Box_Set_Volumes_01_To_24";
const LONG_SERIES: readonly WireSeries[] = [
  LONG_TITLE,
  UNBROKEN_SERIES_TITLE,
].flatMap((title, index) =>
  sampleSeries(1, index + 1).map((series) => ({ ...series, title })),
);
const LONG_CREATOR =
  "Sample_Creator_Whose_Pen_Name_Runs_On_Without_A_Single_Space_Between";
const LONG_BOOK_TITLE = `${LONG_TITLE} Volume 02`;
const SAVED_PANIC: CrashReportOffer = {
  details:
    "Omnileaf 1.2.3 on Linux\nPanic: called `Option::unwrap()` on a `None` value at crates/omnileaf-core/src/library/folder_scan/series_grouping.rs:412:17\n",
  origin: "panic",
};
const READ_AT_MS = Date.UTC(2026, 9, 14, 21, 30);
const DAY_MS = 86_400_000;
const SESSION_SECONDS = 1_500;
const PAGES_READ = 14;
const ON_PAGE_14 = {
  reading: { state: "started", page: 14 },
  startPage: 13,
} as const;
const PAGE_COUNT = 192;

const PACKAGES = licensedPackages({ rust, javascript });
const LONGEST_PACKAGE_NAME = PACKAGES.reduce((longest, licensed) =>
  licensed.name.length > longest.name.length ? licensed : longest,
);

const UNKNOWN_ID = "0190a3e4-0000-8000-8000-00000000000f";
const SAMPLE_SERIES = sampleSeriesId(4);
const SAMPLE_LONG_TITLED_SERIES = sampleSeriesId(19);
const SAMPLE_CREATOR = "Author A";
const NEWEST_KEPT_REPORT = "R-2QX9";
const KEPT_REPORTS = JSON.stringify([
  { code: NEWEST_KEPT_REPORT, madeAtMs: Date.UTC(2026, 9, 15, 18, 5) },
  { code: "R-7F3K", madeAtMs: Date.UTC(2026, 9, 14, 9, 30) },
]);
const SAMPLE_LIBRARY = sampleLibrary("present");
const REGEXP_SYNTAX = /[.*+?^${}()|[\]\\]/g;
const PLACEHOLDER = /\{\w+\}/;

const QUIET_POLL_MS = 10;

function sampleLibraryOn(platform: Platform): FakeBackend {
  return {
    ...sampleBackend(scenarioFrom(new URLSearchParams({ platform })), {
      emit: () => undefined,
    }),
    appInfo: () => fakeAppInfo(platform),
  };
}

function emptyLibraryOn(platform: Platform): FakeBackend {
  return onPlatform(platform).backend;
}

function troubledLibraryOn(
  problem: LibraryProblem,
): (platform: Platform) => FakeBackend {
  return (platform) => ({
    ...onPlatform(platform).backend,
    libraryProblem: () => problem,
  });
}

function unreadableFolderOn(platform: Platform): FakeBackend {
  return {
    ...onPlatform(platform).backend,
    addLibraryFolder: () => {
      throw new CommandFailure({
        code: "folderUnreadable",
        message: "the folder could not be read",
      });
    },
  };
}

function crashReportOn(platform: Platform): FakeBackend {
  return {
    ...sampleLibraryOn(platform),
    offerSavedCrashReport: () => SAVED_PANIC,
  };
}

function longNamedCreatorOn(platform: Platform): FakeBackend {
  return {
    ...sampleLibraryOn(platform),
    creatorSeries: () =>
      LONG_SERIES.map(({ id, title }) => ({
        id,
        title,
        cover: null,
        role: "storyAndArt",
      })),
  };
}

function longTitledBookOn(platform: Platform): FakeBackend {
  return {
    ...onPlatform(platform).backend,
    openBook: () => ({
      ...readerBook(NOT_STARTED),
      title: LONG_BOOK_TITLE,
      seriesTitle: UNBROKEN_SERIES_TITLE,
    }),
  };
}

function bookIdOf(position: number): string {
  return `0190a3e4-0000-8000-8001-${String(position).padStart(12, "0")}`;
}

function historyEntryOf(series: WireSeries, position: number): WireEntry {
  const startedAtMs = READ_AT_MS - position * DAY_MS;
  return {
    book: bookIdOf(position),
    bookTitle: `${series.title} Volume ${String(position)}`,
    series: series.id,
    seriesTitle: series.title,
    position,
    cover: null,
    startedAtMs,
    utcOffsetMinutes: 0,
    readSeconds: SESSION_SECONDS,
    readTo: { state: "page", page: PAGES_READ, pageCount: PAGE_COUNT },
    reading: { state: "started", page: PAGES_READ },
    day: {
      day: Math.floor(startedAtMs / DAY_MS),
      readSeconds: SESSION_SECONDS,
    },
  };
}

function longNamesOn(platform: Platform): FakeBackend {
  const entries = LONG_SERIES.map((series, index) =>
    historyEntryOf(series, index + 1),
  );
  return {
    ...longFoldersOn(platform),
    librarySeries: () => ({ series: [...LONG_SERIES], next: null }),
    librarySeriesCount: () => LONG_SERIES.length,
    librarySearch: () => ({ series: [...LONG_SERIES], next: null }),
    librarySearchCount: () => LONG_SERIES.length,
    readingHistory: () => ({ entries, next: null }),
    historySeries: () => LONG_SERIES.map(({ id, title }) => ({ id, title })),
  };
}

function firstLaunchOn(platform: Platform): FakeBackend {
  return { ...longFoldersOn(platform), firstLaunchFinished: () => false };
}

function libraryFoundOn(platform: Platform): FakeBackend {
  return {
    ...firstLaunchOn(platform),
    foundLibrary: () => ({
      series: 212,
      books: 38,
      lastBackupAtMs: Date.UTC(2026, 9, 12, 9),
    }),
  };
}

async function serveSampleArt(page: Page): Promise<void> {
  await page.route(fakeProtocolRoute("omni"), (route) => {
    const art = sampleArt(fakeProtocolPath(route.request().url(), "omni"));
    return art === undefined
      ? route.fulfill({ status: 404 })
      : route.fulfill({ contentType: "image/svg+xml", body: art });
  });
}

async function serveReaderPages(page: Page): Promise<void> {
  await servePages(page);
}

async function keepTwoReports(page: Page): Promise<void> {
  await page.addInitScript((kept) => {
    window.localStorage.setItem("omnileaf.yourReports", kept);
  }, KEPT_REPORTS);
}

async function isBackendQuiet(page: Page): Promise<boolean> {
  const before = await commandsAsked(page);
  await framesPassed(page);
  const after = await commandsAsked(page);
  return (
    before.unanswered === 0 &&
    after.unanswered === 0 &&
    before.asked === after.asked
  );
}

async function settleOnceAnswered(page: Page): Promise<void> {
  await expect
    .poll(() => isBackendQuiet(page), {
      message: "the fake backend answers every command the screen asks",
      intervals: [QUIET_POLL_MS],
    })
    .toBe(true);
  await settle(page.locator("body"));
}

function literally(text: string): string {
  return text.replaceAll(REGEXP_SYNTAX, String.raw`\$&`);
}

function oneOf(...texts: readonly string[]): RegExp {
  return new RegExp(`^(${texts.map(literally).join("|")})$`);
}

function filledIn(message: string): RegExp {
  return new RegExp(
    `^${message.split(PLACEHOLDER).map(literally).join(".+")}$`,
  );
}

function sampleTitleOf(number: number): string {
  const series = SAMPLE_LIBRARY.find((sample) => sample.number === number);
  if (series === undefined) {
    throw new Error(`the sample library has no series ${String(number)}`);
  }
  return series.title;
}

function heading(name: string | RegExp): Shown {
  return (page) => page.getByRole("heading", { level: 1, name, exact: true });
}

function text(shown: string): Shown {
  return (page) => page.getByRole("main").getByText(shown).first();
}

function pageSlider(page: Page): Locator {
  return page.getByRole("slider");
}

function firstResult(page: Page): Locator {
  return page.getByRole("option").first();
}

function backOnPageToast(page: Page): Locator {
  return page.getByRole("listitem").filter({ hasText: "Back on page 14" });
}

function warningToast(page: Page): Locator {
  return page
    .getByRole("listitem")
    .filter({ hasText: english.library_folder_unreadable_title });
}

function crashPrompt(page: Page): Locator {
  return page
    .getByRole("alertdialog")
    .getByText(english.crash_report_title_last_time)
    .first();
}

function goingTo(path: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.goto(path);
  };
}

function sampleScreen(
  name: string,
  path: string,
  shows: readonly Shown[],
): Screen {
  return {
    name,
    backend: sampleLibraryOn,
    prepare: serveSampleArt,
    open: goingTo(path),
    shows,
  };
}

function screenOf(
  name: string,
  path: string,
  backend: (platform: Platform) => FakeBackend,
  shows: readonly Shown[],
): Screen {
  return { name, backend, open: goingTo(path), shows };
}

function readerScreen(
  name: string,
  backend: (platform: Platform) => FakeBackend,
  title: string,
): Screen {
  return {
    name,
    backend,
    prepare: serveReaderPages,
    open: goingTo(`/read/${BOOK_ID}`),
    shows: [pageSlider, heading(title)],
  };
}

function firstLaunchStep(
  name: string,
  step: number,
  title: string | RegExp,
): Screen {
  return {
    name,
    backend: firstLaunchOn,
    open: (page) => goToStep(page, step),
    shows: [heading(title)],
  };
}

export const SCREENS: readonly Screen[] = [
  sampleScreen("library", "/", [
    heading(english.library_title),
    text(sampleTitleOf(1)),
  ]),
  sampleScreen("browse", "/browse", [heading(english.browse_title)]),
  sampleScreen("history", "/history", [
    heading(english.history_title),
    text(sampleTitleOf(4)),
  ]),
  sampleScreen("search results", `/search${searchQuery("Sample")}`, [
    heading(english.search_title),
    firstResult,
  ]),
  sampleScreen("series", `/series/${SAMPLE_SERIES}`, [
    heading(sampleTitleOf(4)),
  ]),
  sampleScreen(
    "series with a long title",
    `/series/${SAMPLE_LONG_TITLED_SERIES}`,
    [heading(LONG_TITLE)],
  ),
  sampleScreen("series details", `/series/${SAMPLE_SERIES}/edit`, [
    heading(english.series_edit_details),
  ]),
  sampleScreen(
    "creator",
    `/creator/${encodeURIComponent(SAMPLE_CREATOR)}?from=${SAMPLE_SERIES}`,
    [heading(SAMPLE_CREATOR)],
  ),
  {
    ...sampleScreen(
      "creator with a long name and long series titles",
      `/creator/${encodeURIComponent(LONG_CREATOR)}?from=${SAMPLE_LONG_TITLED_SERIES}`,
      [heading(LONG_CREATOR), text(UNBROKEN_SERIES_TITLE)],
    ),
    backend: longNamedCreatorOn,
  },
  readerScreen(
    "reader with a book open",
    (platform) => readerBackend(onPlatform(platform).backend),
    readerBook(NOT_STARTED).title,
  ),
  {
    ...readerScreen(
      "reader back on a saved page",
      (platform) => readerBackend(onPlatform(platform).backend, ON_PAGE_14),
      readerBook(ON_PAGE_14).title,
    ),
    shows: [pageSlider, backOnPageToast],
  },
  readerScreen(
    "reader with a long series and book title",
    longTitledBookOn,
    LONG_BOOK_TITLE,
  ),
  sampleScreen("settings", "/settings", [
    heading(oneOf(english.settings_title, english.general_title)),
  ]),
  sampleScreen("library settings", "/settings/library", [
    heading(english.library_title),
  ]),
  sampleScreen("adult content settings", "/settings/library/adult-content", [
    heading(english.adult_content_title),
  ]),
  sampleScreen("library tab settings", "/settings/library/tabs", [
    heading(english.library_tabs_title),
  ]),
  sampleScreen("tag settings", "/settings/library/tags", [
    heading(english.manage_tags_title),
  ]),
  sampleScreen("appearance settings", "/settings/appearance", [
    heading(english.appearance_title),
  ]),
  sampleScreen("reading settings", "/settings/reading", [
    heading(english.reading_title),
  ]),
  sampleScreen("general settings", "/settings/general", [
    heading(english.general_title),
  ]),
  sampleScreen("language settings", "/settings/general/language", [
    heading(english.language_label),
  ]),
  sampleScreen("advanced settings", "/settings/advanced", [
    heading(english.advanced_title),
  ]),
  sampleScreen("animation settings", "/settings/advanced/animations", [
    heading(english.animations_title),
  ]),
  sampleScreen("storage settings", "/settings/storage", [
    heading(english.storage_title),
  ]),
  sampleScreen("about", "/settings/about", [heading(english.about_title)]),
  sampleScreen("licences", "/settings/about/licences", [
    heading(english.about_licences),
  ]),
  sampleScreen(
    "licence of the longest package name",
    `/settings/about/licences/${LONGEST_PACKAGE_NAME.key}`,
    [heading(LONGEST_PACKAGE_NAME.name)],
  ),
  sampleScreen("problem report", "/settings/about/report", [
    heading(english.about_report_problem),
  ]),
  sampleScreen("your reports", "/settings/about/reports", [
    heading(english.your_reports_title),
  ]),
  {
    ...sampleScreen("your reports with two kept", "/settings/about/reports", [
      heading(english.your_reports_title),
      text(NEWEST_KEPT_REPORT),
    ]),
    prepare: keepTwoReports,
  },
  sampleScreen("privacy settings", "/settings/privacy", [
    heading(english.privacy_title),
  ]),
  sampleScreen("permissions", "/settings/privacy/permissions", [
    heading(english.permissions_title),
  ]),
  sampleScreen(
    "screenshot mode settings",
    "/settings/privacy/screenshot-mode",
    [heading(english.screenshot_mode_title)],
  ),
  screenOf("empty library", "/", emptyLibraryOn, [
    heading(english.library_title),
    text(english.library_empty),
  ]),
  screenOf("empty history", "/history", emptyLibraryOn, [
    heading(english.history_title),
    text(english.history_empty_title),
  ]),
  screenOf("search in an empty library", "/search", emptyLibraryOn, [
    heading(english.search_title),
    text(english.search_by),
  ]),
  screenOf("missing series", `/series/${UNKNOWN_ID}`, emptyLibraryOn, [
    heading(english.series_not_found),
  ]),
  screenOf("missing book", `/read/${UNKNOWN_ID}`, emptyLibraryOn, [
    heading(english.reader_not_found),
  ]),
  screenOf("missing page", "/nowhere", emptyLibraryOn, [
    heading(english.problem_page_missing_title),
  ]),
  screenOf(
    "library a newer Omnileaf wrote",
    "/",
    troubledLibraryOn("writtenByANewerVersion"),
    [heading(english.problem_library_newer_title)],
  ),
  screenOf(
    "library that couldn't be opened",
    "/",
    troubledLibraryOn("couldNotOpen"),
    [heading(english.problem_library_failed_title)],
  ),
  {
    name: "warning toast",
    backend: unreadableFolderOn,
    open: async (page) => {
      await page.goto("/");
      await page
        .getByRole("main")
        .getByRole("button", { name: english.library_add_folder })
        .click();
    },
    shows: [warningToast],
  },
  {
    ...sampleScreen("crash report prompt", "/", [crashPrompt]),
    backend: crashReportOn,
  },
  screenOf("library with long series titles", "/", longNamesOn, [
    heading(english.library_title),
    text(UNBROKEN_SERIES_TITLE),
  ]),
  screenOf("history with long series titles", "/history", longNamesOn, [
    heading(english.history_title),
    text(UNBROKEN_SERIES_TITLE),
  ]),
  screenOf(
    "search with long series titles",
    `/search${searchQuery("Sample")}`,
    longNamesOn,
    [heading(english.search_title), text(UNBROKEN_SERIES_TITLE)],
  ),
  screenOf(
    "library settings with long folder names",
    "/settings/library",
    longNamesOn,
    [heading(english.library_title), text(LONG_FOLDER_NAME)],
  ),
  firstLaunchStep(
    "first launch welcome",
    0,
    english.first_launch_welcome_title,
  ),
  firstLaunchStep(
    "first launch home folder",
    1,
    oneOf(english.first_launch_home_title, english.first_launch_home_title_ios),
  ),
  firstLaunchStep(
    "first launch folder linking",
    2,
    english.first_launch_link_title,
  ),
  firstLaunchStep(
    "first launch choices",
    3,
    english.first_launch_choices_title,
  ),
  firstLaunchStep(
    "first launch ready",
    4,
    filledIn(english.first_launch_ready_found_title),
  ),
  {
    ...firstLaunchStep(
      "first launch with a library already there",
      1,
      english.first_launch_found_title,
    ),
    backend: libraryFoundOn,
  },
];

export async function visit(page: Page, screen: Screen): Promise<void> {
  await screen.prepare?.(page);
  await screen.open(page);
  for (const shown of screen.shows) {
    await expect(shown(page)).toBeVisible();
  }
  await settleOnceAnswered(page);
}

import { setTimeout as delay } from "node:timers/promises";

import { AxeBuilder } from "@axe-core/playwright";
import {
  type BrowserContext,
  expect,
  test as base,
  type Locator,
  type Page,
  type PlaywrightWorkerOptions,
  type ViewportSize,
} from "@playwright/test";

import {
  type AppInfo,
  DEFAULT_LIBRARY_VIEW,
  type Platform,
  type Theme,
} from "../../src/lib/ipc/bindings.ts";
import { NEW_ADULT_CONTENT } from "../../src/lib/library/adult-content.ts";
import { NEW_LIBRARY_TABS } from "../../src/lib/library/library-tabs.ts";
import { NEW_LIBRARY_LISTING } from "../../src/lib/library/library-listing.ts";
import type { ScreenSize } from "../../src/lib/library/library-view.ts";
import {
  CommandFailure,
  type FakeBackend,
  installFakeBackend,
} from "./fake-backend.ts";

export { sidewaysOverflow } from "./sideways-overflow.ts";

export const FAKE_APP_VERSION = "1.2.3";
export const FAKE_SOURCE_CODE = "repo.example.org/omnileaf";
export const FAKE_SYSTEM = "Fedora 43";
export const FAKE_REPORT_CODE = "R-8M4T";
export const IPHONE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
export const IPAD_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";

export const MEDIUM_MIN_WIDTH = 600;
export const EXPANDED_MIN_WIDTH = 840;
export const LARGE_MIN_WIDTH = 1200;

export function fakeAppInfo(platform: Platform): AppInfo {
  return {
    version: FAKE_APP_VERSION,
    platform,
    sourceCode: FAKE_SOURCE_CODE,
    isDevelopmentBuild: false,
  };
}

export const NOTHING_READ_THIS_WEEK = {
  readSeconds: 0,
  booksOpened: 0,
  booksFinished: 0,
  daysInARow: 0,
} as const;

export const DEFAULT_BACKEND: FakeBackend = {
  appInfo: () => fakeAppInfo("linux"),
  libraryProblem: () => null,
  addLibraryFolder: () => null,
  linkLibraryFolder: () => {
    throw new CommandFailure({
      code: "folderUnreadable",
      message: "the default backend links no folders",
    });
  },
  libraryFolders: () => ({ folders: [], next: null }),
  librarySeries: () => ({ series: [], next: null }),
  librarySeriesCount: () => 0,
  librarySearch: () => ({ series: [], next: null }),
  folderSeries: () => ({ series: [], next: null }),
  folderSeriesCount: () => 0,
  librarySearchCount: () => 0,
  seriesOverview: () => {
    throw new CommandFailure({
      code: "seriesNotFound",
      message: "that series isn't in the library",
    });
  },
  seriesBooks: () => ({ books: [], next: null }),
  creatorSeries: () => [],
  markBooks: () => null,
  markSeriesRead: () => [],
  bookmarkPages: () => null,
  bookPlace: () => null,
  hideFilesLike: () => "cbr",
  hideFileType: () => null,
  showFileType: () => null,
  hiddenFileTypes: () => [],
  bookFile: () => null,
  libraryCategories: () => [],
  seriesLabels: () => ({
    keepsLabels: false,
    categories: [],
    tags: [],
    suggestedTags: [],
  }),
  labelSeries: () => {
    throw new CommandFailure({
      code: "labelsNotKept",
      message: "the library keeps no categories or tags yet",
    });
  },
  keepsDetailEdits: () => false,
  seriesDetails: () => {
    throw new CommandFailure({
      code: "seriesNotFound",
      message: "that series isn't in the library",
    });
  },
  editSeriesDetails: () => {
    throw new CommandFailure({
      code: "detailsNotKept",
      message: "the library keeps no edits to series details yet",
    });
  },
  libraryFilterChoices: () => ({
    formats: [],
    languages: [],
    tags: [],
    ratesAdult: false,
    keepsBookmarks: false,
    smart: [],
  }),
  categorySeries: () => ({ series: [], next: null }),
  categorySeriesCount: () => 0,
  orientScreen: () => null,
  changeFullScreen: () => false,
  openBook: () => {
    throw new CommandFailure({
      code: "bookNotFound",
      message: "that book isn't in the library",
    });
  },
  croppedPagePaths: (paths) => paths,
  readingRestored: () => null,
  pageShown: () => null,
  closeBook: () => null,
  readingHistory: () => ({ entries: [], next: null }),
  removeFromHistory: () => null,
  restoreToHistory: () => null,
  clearHistory: () => null,
  restoreHistory: () => null,
  readingWeek: () => NOTHING_READ_THIS_WEEK,
  readingTimeBetween: () => 0,
  bookReadTime: () => 0,
  readingSummary: () => null,
  bookSessions: () => null,
  historySeries: () => [],
  libraryListing: () => NEW_LIBRARY_LISTING,
  setLibraryListing: () => null,
  libraryTabs: () => [...NEW_LIBRARY_TABS],
  librarySpellingSuggestion: () => null,
  missingLibraryFolders: () => [],
  libraryHiddenSeriesCount: () => 0,
  showMissingLibraryFolder: () => null,
  relocateLibraryFolder: () => null,
  signInToLibraryFolder: () => "cancelled",
  showSeriesInFolder: () => null,
  setLibraryTabs: () => null,
  libraryTags: () => [],
  renameLibraryTag: () => null,
  removeLibraryTag: () => [],
  libraryAdultContent: () => NEW_ADULT_CONTENT,
  setLibraryAdultContent: () => null,
  libraryView: () => DEFAULT_LIBRARY_VIEW,
  setLibraryView: () => null,
  removeLibraryFolder: () => null,
  libraryFolderBookCount: () => 0,
  rescanLibraryFolder: () => {
    throw new CommandFailure({
      code: "folderNotFound",
      message: "that folder isn't in the library",
    });
  },
  rescanLibraryFolders: () => [],
  removeBooksOfEmptiedFolder: () => ({ kind: "kept" }),
  foundLibrary: () => null,
  chooseHomeFolder: () => null,
  useFoundLibrary: () => null,
  moveHomeFolder: () => null,
  firstLaunchFinished: () => true,
  finishFirstLaunch: () => null,
  setAppLanguage: () => null,
  setScheduledRescans: () => undefined,
  setBookOpen: () => undefined,
  setLearnsReadingSpeed: () => undefined,
  matchSystemBars: () => null,
  watchBackSwipes: () => null,
  allowBackSwipe: () => null,
  captureVolumeKeys: () => null,
  releaseVolumeKeys: () => null,
  copyVersionDetails: () => null,
  openProjectLink: () => null,
  problemReport: () => ({
    code: FAKE_REPORT_CODE,
    version: FAKE_APP_VERSION,
    system: FAKE_SYSTEM,
    log: [],
  }),
  copyProblemReport: () => null,
  sendProblemReport: () => null,
  copyProblemReportCode: () => null,
  openProblemReportIssue: () => null,
  saveProblemReport: () => ({
    place: { kind: "folder", folder: "~/Downloads" },
    file: "omnileaf-report-2026-10-16.txt",
  }),
  showSavedProblemReport: () => null,
  offerSavedCrashReport: () => null,
  offerInterfaceErrorReport: (error) => ({
    details: error.message,
    origin: "interface",
  }),
  sendCrashReport: () => null,
  copyCrashReport: () => null,
  declineCrashReport: () => null,
  checkStorage: () => ({
    omnileafBytes: 1_440_000_000,
    cachedPagesBytes: 1_200_000_000,
    coversBytes: 210_000_000,
    freeBytes: 41_000_000_000,
    totalBytes: 128_000_000_000,
    isLow: false,
  }),
  clearCachedPages: () => null,
  clearCovers: () => null,
  showTrayMenu: () => null,
  showIconActions: () => null,
  watchIconActions: () => null,
  openSystemSettings: () => null,
  panicInCore: () => null,
  crashAndQuit: () => null,
};

export function onPlatform(platform: Platform): { backend: FakeBackend } {
  return {
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: () => fakeAppInfo(platform),
    },
  };
}

export function viewportOf(page: Page): ViewportSize {
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error("the page has no viewport");
  }
  return viewport;
}

export function screenSizeAt(width: number): ScreenSize {
  if (width >= LARGE_MIN_WIDTH) {
    return "desktop";
  }
  return width >= MEDIUM_MIN_WIDTH ? "tablet" : "phone";
}

export function screenSizeOf(page: Page): ScreenSize {
  return screenSizeAt(viewportOf(page).width);
}

export const LARGEST_TEXT_SCALE = 2;

export async function setTextScale(page: Page, scale: number): Promise<void> {
  await page.addInitScript(
    (css) => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
      });
    },
    `:root { --text-scale: ${String(scale)} !important; }`,
  );
}

type BrowserName = PlaywrightWorkerOptions["browserName"];

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

export function tokenColour(
  page: Page,
  token: `--${string}`,
  inTheme?: Theme,
): Promise<string> {
  return page.evaluate(
    ([name, theme]) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      if (theme !== undefined) {
        probe.dataset.theme = theme;
      }
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    },
    [token, inTheme] as const,
  );
}

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("the element has no layout box");
  }
  return box;
}

export function targetOf(
  locator: Locator,
): Promise<{ width: number; height: number }> {
  return locator.evaluate((element) => {
    const drawn = element.getBoundingClientRect();
    const bleed = getComputedStyle(element, "::before");
    const hasBleed = bleed.content !== "none" && bleed.position === "absolute";
    const bleedSize = (size: string) =>
      hasBleed ? Number.parseFloat(size) || 0 : 0;
    return {
      width: Math.max(drawn.width, bleedSize(bleed.width)),
      height: Math.max(drawn.height, bleedSize(bleed.height)),
    };
  });
}

const SETTLE_GRACE_MS = 2000;
const FRAME_WAIT_MS = 50;
const FRAME_LIMIT_MS = 15_000;

function drewTwoFramesBefore(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  });
}

async function drewTwoFramesWithin(
  page: Page,
  pageTimeoutMs: number,
): Promise<boolean> {
  const stopWaiting = new AbortController();
  try {
    return await Promise.race([
      page.evaluate(drewTwoFramesBefore, pageTimeoutMs),
      delay(FRAME_LIMIT_MS, false, { signal: stopWaiting.signal }),
    ]);
  } finally {
    stopWaiting.abort();
  }
}

export async function framesPassed(page: Page): Promise<void> {
  if (!(await drewTwoFramesWithin(page, FRAME_LIMIT_MS))) {
    throw new Error(
      `the page drew no frame within ${String(FRAME_LIMIT_MS)} ms`,
    );
  }
}

/** Waits two frames, or a moment when none come, since headless WebKit can stop drawing frames while nothing asks for one. */
export async function framesOrAMomentPassed(page: Page): Promise<void> {
  await drewTwoFramesWithin(page, FRAME_WAIT_MS);
}

/** Headless WebKit can draw no frame after a resize until something asks for one, so the page would never hear its media queries change. */
function drawAfterEachResize(page: Page): void {
  const resize = page.setViewportSize.bind(page);
  page.setViewportSize = async (size) => {
    await resize(size);
    if (!(await drewTwoFramesWithin(page, FRAME_LIMIT_MS))) {
      throw new Error(
        `the page drew no frame within ${String(FRAME_LIMIT_MS)} ms of resizing to ${String(size.width)}x${String(size.height)}`,
      );
    }
  };
}

/** Lists a part bits-ui still holds in its starting style as well, since no animation reports it until the frame its transition begins. */
async function animationsWithin(locator: Locator): Promise<string[]> {
  await framesOrAMomentPassed(locator.page());
  return locator.evaluate((element) => [
    ...element.getAnimations({ subtree: true }).map((animation) => {
      const target =
        animation.effect instanceof KeyframeEffect
          ? animation.effect.target
          : null;
      const name =
        animation instanceof CSSTransition
          ? animation.transitionProperty
          : animation instanceof CSSAnimation
            ? animation.animationName
            : animation.id;
      return `${name} on ${target?.tagName.toLowerCase() ?? "?"} ${target?.getAttribute("class") ?? ""}`;
    }),
    ...(element.closest("[data-starting-style]") === null &&
    element.querySelector("[data-starting-style]") === null
      ? []
      : ["a part still held in its starting style"]),
  ]);
}

/** Finishes whatever still moves after a grace period, since headless WebKit can stop advancing its animations, and even its frames, while nothing asks for one. */
export async function settle(locator: Locator): Promise<void> {
  try {
    await expect
      .poll(() => animationsWithin(locator), { timeout: SETTLE_GRACE_MS })
      .toEqual([]);
  } catch {
    await locator.evaluate((element) => {
      for (const animation of element.getAnimations({ subtree: true })) {
        animation.finish();
      }
    });
    await expect.poll(() => animationsWithin(locator)).toEqual([]);
  }
}

type RoleOrTag = string;
type TransitionedProperty = string;
type TransitionNote = `${RoleOrTag} ${TransitionedProperty}`;

function noteTransitions(): void {
  document.addEventListener("transitionrun", (event) => {
    if (event.target instanceof Element) {
      const root = document.documentElement;
      const roleOrTag: RoleOrTag =
        event.target.getAttribute("role") ?? event.target.tagName.toLowerCase();
      const note: TransitionNote = `${roleOrTag} ${event.propertyName}`;
      root.dataset.transitions = `${root.dataset.transitions ?? ""}${note},`;
    }
  });
}

export async function watchTransitions(
  page: Page,
): Promise<() => Promise<TransitionNote[]>> {
  await page.addInitScript(noteTransitions);
  await page.evaluate(noteTransitions);
  return () =>
    page.evaluate(() =>
      (document.documentElement.dataset.transitions ?? "")
        .split(",")
        .filter((note): note is TransitionNote => note.includes(" ")),
    );
}

export function transitionsOf(
  locator: Locator,
): Promise<TransitionedProperty[]> {
  return locator.evaluate((element) =>
    element
      .getAnimations()
      .flatMap((animation) =>
        animation instanceof CSSTransition
          ? [animation.transitionProperty]
          : [],
      ),
  );
}

export const APP_PAGES = [
  "/",
  "/browse",
  "/history",
  "/settings",
  "/settings/library",
  "/settings/appearance",
  "/settings/reading",
  "/settings/general",
  "/settings/general/language",
  "/settings/advanced",
  "/settings/about",
  "/settings/about/licences",
  "/settings/about/report",
  "/settings/about/reports",
  "/settings/privacy/permissions",
  "/search",
  "/series/0190a3e4-0000-8000-8000-00000000000f",
  "/read/0190a3e4-0000-8000-8000-00000000000f",
] as const;

type Violations = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

function runningAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === "running" &&
          animation.effect?.getComputedTiming().iterations !== Infinity,
      )
      .map((animation) => {
        const name =
          animation instanceof CSSTransition
            ? `transition of ${animation.transitionProperty}`
            : animation instanceof CSSAnimation
              ? `animation ${animation.animationName}`
              : `animation ${animation.id}`;
        const target =
          animation.effect instanceof KeyframeEffect
            ? animation.effect.target
            : null;
        const targetName =
          target === null
            ? "no element"
            : [target.tagName.toLowerCase(), ...target.classList].join(".");
        return `${name} on ${targetName}`;
      }),
    ...(document.querySelector("[data-starting-style]") === null
      ? []
      : ["a part still held in its starting style"]),
  ]);
}

const PAGE_ZOOM_RULE_LEFT_TO_THE_SYSTEM = "meta-viewport";

/** Waits out animations that end first, a part bits-ui still holds in its starting style before its fade begins, and the frame WebKit needs to draw a finished fade's end, since axe reads colours mid-fade as they are. */
export async function accessibilityViolations(page: Page): Promise<Violations> {
  await expect
    .poll(() => runningAnimations(page), {
      message: "animations still running before the axe check",
    })
    .toEqual([]);
  await framesPassed(page);
  const results = await new AxeBuilder({ page })
    .disableRules([PAGE_ZOOM_RULE_LEFT_TO_THE_SYSTEM])
    .analyze();
  return results.violations;
}

export async function selectedByDoubleClick(
  page: Page,
  target: Locator,
): Promise<string> {
  await target.scrollIntoViewIfNeeded();
  const point = await target.evaluate((element) => {
    const texts = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node !== null; node = texts.nextNode()) {
      const offset = node.textContent?.search(/\S/) ?? -1;
      if (offset >= 0) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const { x, y, width, height } = range.getBoundingClientRect();
        return { x: x + width / 2, y: y + height / 2 };
      }
    }
    throw new Error("the element shows no text");
  });
  await page.mouse.dblclick(point.x, point.y);
  return page.evaluate(() => getSelection()?.toString() ?? "");
}

async function markReaderGuideSeen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const direction of ["leftToRight", "rightToLeft"]) {
      localStorage.setItem(`omnileaf.readerGuide.${direction}`, "seen");
    }
  });
}

export async function openFakeApp(
  context: BrowserContext,
  backend: FakeBackend,
): Promise<Page> {
  const page = await context.newPage();
  drawAfterEachResize(page);
  await markReaderGuideSeen(page);
  await installFakeBackend(page, backend);
  return page;
}

export const test = base.extend<{
  backend: FakeBackend;
  hasSeenReaderGuide: boolean;
  platform: Platform | undefined;
}>({
  backend: [DEFAULT_BACKEND, { option: true }],
  hasSeenReaderGuide: [true, { option: true }],
  platform: [undefined, { option: true }],
  page: async ({ page, backend, hasSeenReaderGuide, platform }, use) => {
    drawAfterEachResize(page);
    if (hasSeenReaderGuide) {
      await markReaderGuideSeen(page);
    }
    await installFakeBackend(
      page,
      platform === undefined
        ? backend
        : { ...backend, appInfo: () => fakeAppInfo(platform) },
    );
    await use(page);
  },
});

type PlatformInterface = "android" | "ios" | "desktop";

interface Webview {
  readonly browserName: BrowserName;
  readonly hasTouch: boolean;
  readonly interface: PlatformInterface;
}

/** Android's WebView and Windows' WebView2 are Chromium, while iOS's and macOS's WKWebView and Linux's WebKitGTK are WebKit, so the one desktop interface ships in both engines. */
const WEBVIEWS = {
  android: { browserName: "chromium", hasTouch: true, interface: "android" },
  ios: { browserName: "webkit", hasTouch: true, interface: "ios" },
  windows: { browserName: "chromium", hasTouch: false, interface: "desktop" },
  macos: { browserName: "webkit", hasTouch: false, interface: "desktop" },
  linux: { browserName: "webkit", hasTouch: false, interface: "desktop" },
} as const satisfies Record<Platform, Webview>;

const PLATFORMS = Object.keys(WEBVIEWS).filter(
  (key): key is Platform => key in WEBVIEWS,
);

export function platformsShownBy({
  browserName,
  hasTouch,
}: Pick<Webview, "browserName" | "hasTouch">): Platform[] {
  return PLATFORMS.filter(
    (platform) =>
      WEBVIEWS[platform].browserName === browserName &&
      WEBVIEWS[platform].hasTouch === hasTouch,
  );
}

function enginesShipping(shown: PlatformInterface): BrowserName[] {
  return [
    ...new Set(
      PLATFORMS.filter(
        (platform) => WEBVIEWS[platform].interface === shown,
      ).map((platform) => WEBVIEWS[platform].browserName),
    ),
  ];
}

export function testOnlyInItsWebview(platform: Platform): void {
  const engines = enginesShipping(WEBVIEWS[platform].interface);
  test.skip(
    ({ browserName }) => !engines.includes(browserName),
    `${platform} shows the interface in ${engines.join(" and ")}`,
  );
}

export { expect };

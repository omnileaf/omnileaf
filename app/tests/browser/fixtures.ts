import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  test as base,
  type Locator,
  type Page,
  type ViewportSize,
} from "@playwright/test";

import {
  type AppInfo,
  DEFAULT_LIBRARY_VIEW,
  type Platform,
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

export const FAKE_APP_VERSION = "1.2.3";
export const FAKE_SOURCE_CODE = "repo.example.org/omnileaf";
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
  readingRestored: () => null,
  pageShown: () => null,
  closeBook: () => null,
  readingHistory: () => ({ entries: [], next: null }),
  readingWeek: () => NOTHING_READ_THIS_WEEK,
  readingTimeBetween: () => 0,
  bookReadTime: () => 0,
  bookSessions: () => null,
  historySeries: () => [],
  libraryListing: () => NEW_LIBRARY_LISTING,
  setLibraryListing: () => null,
  libraryTabs: () => [...NEW_LIBRARY_TABS],
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
  firstLaunchFinished: () => true,
  finishFirstLaunch: () => null,
  setAppLanguage: () => null,
  setScheduledRescans: () => undefined,
  matchSystemBars: () => null,
  watchBackSwipes: () => null,
  allowBackSwipe: () => null,
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

export function screenSizeOf(page: Page): ScreenSize {
  const { width } = viewportOf(page);
  if (width >= LARGE_MIN_WIDTH) {
    return "desktop";
  }
  return width >= MEDIUM_MIN_WIDTH ? "tablet" : "phone";
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

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

/** The colour a theme token resolves to, as the browser writes computed colours, so a test follows whichever theme the app ships; naming a theme reads that theme's value of a role such as `--background`. */
export function tokenColour(
  page: Page,
  token: string,
  theme?: "light" | "dark",
): Promise<string> {
  return page.evaluate(
    ([name, themed]) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      if (themed !== undefined) {
        probe.dataset.theme = themed;
      }
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    },
    [token, theme] as const,
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

/** Lists a part bits-ui still holds in its starting style as well, since no animation reports it until the frame its transition begins. */
function animationsWithin(locator: Locator): Promise<string[]> {
  return locator.evaluate(async (element, frameWaitMs) => {
    const nextFrame = new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    const timer = new Promise<void>((resolve) => {
      setTimeout(resolve, frameWaitMs);
    });
    await Promise.race([nextFrame, timer]);
    return [
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
    ];
  }, FRAME_WAIT_MS);
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

function noteTransitions(): void {
  document.addEventListener("transitionrun", (event) => {
    if (event.target instanceof Element) {
      const root = document.documentElement;
      const name =
        event.target.getAttribute("role") ?? event.target.tagName.toLowerCase();
      root.dataset.transitions = `${root.dataset.transitions ?? ""}${name} ${event.propertyName},`;
    }
  });
}

/** Notes every transition that starts from now on, on this page and the ones loaded after it, as the role or tag of its element and what it moves, such as "dialog translate". */
export async function watchTransitions(
  page: Page,
): Promise<() => Promise<string[]>> {
  await page.addInitScript(noteTransitions);
  await page.evaluate(noteTransitions);
  return () =>
    page.evaluate(() =>
      (document.documentElement.dataset.transitions ?? "")
        .split(",")
        .filter((transition) => transition !== ""),
    );
}

/** Names what each transition running on the element moves, such as translate or opacity. */
export function transitionsOf(locator: Locator): Promise<string[]> {
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
  "/search",
  "/series/0190a3e4-0000-8000-8000-00000000000f",
  "/read/0190a3e4-0000-8000-8000-00000000000f",
] as const;

export function sidewaysOverflow(
  page: Page,
  within = "main",
): Promise<string[]> {
  return page.evaluate((scope) => {
    const touchTargetBleedOf = (element: Element): number => {
      const before = getComputedStyle(element, "::before");
      if (before.position !== "absolute") {
        return 0;
      }
      const bleed =
        Number.parseFloat(before.width) - element.getBoundingClientRect().width;
      return Number.isNaN(bleed) ? 0 : bleed;
    };
    const bleedOf = (element: Element): number =>
      Math.max(
        0,
        touchTargetBleedOf(element),
        ...[...element.querySelectorAll("*")].flatMap((descendant) => [
          -Number.parseFloat(getComputedStyle(descendant).marginInlineEnd),
          touchTargetBleedOf(descendant),
        ]),
      );
    const overflowing: string[] = [];
    for (const element of document.querySelectorAll(`${scope} *`)) {
      const style = getComputedStyle(element);
      const isClippedArt =
        ["hidden", "clip"].includes(style.overflowX) &&
        element.matches("[aria-hidden=true]");
      const isCutOnPurpose =
        style.textOverflow === "ellipsis" ||
        style.clipPath !== "none" ||
        isClippedArt;
      const overflow = element.scrollWidth - element.clientWidth;
      if (
        !isCutOnPurpose &&
        element.clientWidth > 0 &&
        overflow > 0 &&
        overflow > bleedOf(element)
      ) {
        overflowing.push(element.outerHTML.slice(0, 120));
      }
    }
    if (document.documentElement.scrollWidth > window.innerWidth) {
      overflowing.push("the page");
    }
    return overflowing;
  }, within);
}

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

/** Waits out animations that end first, and a part bits-ui still holds in its starting style before its fade begins, since axe reads colours mid-fade as they are. */
export async function accessibilityViolations(page: Page): Promise<Violations> {
  await expect
    .poll(() => runningAnimations(page), {
      message: "animations still running before the axe check",
    })
    .toEqual([]);
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

export const test = base.extend<{
  backend: FakeBackend;
  hasSeenReaderGuide: boolean;
}>({
  backend: [DEFAULT_BACKEND, { option: true }],
  hasSeenReaderGuide: [true, { option: true }],
  page: async ({ page, backend, hasSeenReaderGuide }, use) => {
    if (hasSeenReaderGuide) {
      await page.addInitScript(() => {
        for (const direction of ["leftToRight", "rightToLeft"]) {
          localStorage.setItem(`omnileaf.readerGuide.${direction}`, "seen");
        }
      });
    }
    await installFakeBackend(page, backend);
    await use(page);
  },
});

/** Android's WebView is Chromium and iOS's is WebKit, but the desktop interface, the same on every desktop, ships in both: WebView2 on Windows, WebKit on macOS and Linux. */
const WEBVIEW_ENGINE = {
  android: "chromium",
  ios: "webkit",
  windows: null,
  macos: null,
  linux: null,
} as const satisfies Record<Platform, "chromium" | "webkit" | null>;

export function testOnlyInItsWebview(platform: Platform): void {
  const engine = WEBVIEW_ENGINE[platform];
  if (engine === null) {
    return;
  }
  test.skip(
    ({ browserName }) => browserName !== engine,
    `${platform} shows the interface in ${engine}`,
  );
}

export { expect };

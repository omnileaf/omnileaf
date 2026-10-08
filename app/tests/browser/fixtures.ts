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
import type { ScreenSize } from "../../src/lib/library/library-view.ts";
import {
  CommandFailure,
  type FakeBackend,
  installFakeBackend,
} from "./fake-backend.ts";

export const FAKE_APP_VERSION = "1.2.3";
export const FAKE_SOURCE_CODE = "repo.example.org/omnileaf";

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

export const DEFAULT_BACKEND: FakeBackend = {
  appInfo: () => fakeAppInfo("linux"),
  libraryProblem: () => null,
  addLibraryFolder: () => null,
  libraryFolders: () => ({ folders: [], next: null }),
  librarySeries: () => ({ series: [], next: null }),
  librarySeriesCount: () => 0,
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
  firstLaunchFinished: () => true,
  finishFirstLaunch: () => null,
  setAppLanguage: () => null,
  matchSystemBars: () => null,
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

/** The size the library draws the page's screen at, each with covers per row of its own. */
export function screenSizeOf(page: Page): ScreenSize {
  const { width } = viewportOf(page);
  if (width >= LARGE_MIN_WIDTH) {
    return "desktop";
  }
  return width >= MEDIUM_MIN_WIDTH ? "tablet" : "phone";
}

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("the element has no layout box");
  }
  return box;
}

/** Waits until nothing in `locator`'s subtree is animating, polling so it also catches transitions that start while it waits. */
export async function settle(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    )
    .toBe(0);
}

type Violations = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

function runningAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
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
  );
}

/** Waits for every animation that ends, such as a fade, since axe reads colours mid-fade as they are. */
export async function accessibilityViolations(page: Page): Promise<Violations> {
  await expect
    .poll(() => runningAnimations(page), {
      message: "animations still running before the axe check",
    })
    .toEqual([]);
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations;
}

export const test = base.extend<{ backend: FakeBackend }>({
  backend: [DEFAULT_BACKEND, { option: true }],
  page: async ({ page, backend }, use) => {
    await installFakeBackend(page, backend);
    await use(page);
  },
});

export { expect };

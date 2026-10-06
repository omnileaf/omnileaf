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

function fakeAppInfo(platform: Platform): AppInfo {
  return { version: FAKE_APP_VERSION, platform, sourceCode: FAKE_SOURCE_CODE };
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

export const test = base.extend<{ backend: FakeBackend }>({
  backend: [DEFAULT_BACKEND, { option: true }],
  page: async ({ page, backend }, use) => {
    await installFakeBackend(page, backend);
    await use(page);
  },
});

export { expect } from "@playwright/test";

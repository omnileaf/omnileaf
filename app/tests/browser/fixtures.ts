import {
  test as base,
  type Locator,
  type Page,
  type ViewportSize,
} from "@playwright/test";

import type { AppInfo, Platform } from "../../src/lib/ipc/bindings.ts";
import { type FakeBackend, installFakeBackend } from "./fake-backend.ts";

export const FAKE_APP_VERSION = "1.2.3";
export const FAKE_SOURCE_CODE = "repo.example.org/omnileaf";

export const MEDIUM_MIN_WIDTH = 600;
export const EXPANDED_MIN_WIDTH = 840;

function fakeAppInfo(platform: Platform): AppInfo {
  return { version: FAKE_APP_VERSION, platform, sourceCode: FAKE_SOURCE_CODE };
}

export const DEFAULT_BACKEND: FakeBackend = {
  appInfo: () => fakeAppInfo("linux"),
  addLibraryFolder: () => null,
  matchSystemBars: () => null,
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

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("the element has no layout box");
  }
  return box;
}

export const test = base.extend<{ backend: FakeBackend }>({
  backend: [DEFAULT_BACKEND, { option: true }],
  page: async ({ page, backend }, use) => {
    await installFakeBackend(page, backend);
    await use(page);
  },
});

export { expect } from "@playwright/test";

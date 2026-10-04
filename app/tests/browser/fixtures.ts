import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  test as base,
  type Locator,
  type Page,
  type ViewportSize,
} from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { type FakeBackend, installFakeBackend } from "./fake-backend.ts";

export const FAKE_APP_VERSION = "1.2.3";

export const MEDIUM_MIN_WIDTH = 600;
export const EXPANDED_MIN_WIDTH = 840;

export const DEFAULT_BACKEND: FakeBackend = {
  appInfo: () => ({ version: FAKE_APP_VERSION, platform: "linux" }),
  addLibraryFolder: () => null,
  matchSystemBars: () => null,
};

export function onPlatform(platform: Platform): { backend: FakeBackend } {
  return {
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: () => ({ version: FAKE_APP_VERSION, platform }),
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

type Violations = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

function runningAnimationCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running").length,
  );
}

/**
 * Waits for every animation and transition to end, since axe reads colours
 * mid-fade as they are.
 */
export async function accessibilityViolations(page: Page): Promise<Violations> {
  await expect.poll(() => runningAnimationCount(page)).toBe(0);
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

import { test as base } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { type FakeBackend, installFakeBackend } from "./fake-backend.ts";

export const FAKE_APP_VERSION = "1.2.3";

export const DEFAULT_BACKEND: FakeBackend = {
  appInfo: () => ({ version: FAKE_APP_VERSION, platform: "linux" }),
  addLibraryFolder: () => null,
};

export function onPlatform(platform: Platform): { backend: FakeBackend } {
  return {
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: () => ({ version: FAKE_APP_VERSION, platform }),
    },
  };
}

export const test = base.extend<{ backend: FakeBackend }>({
  backend: [DEFAULT_BACKEND, { option: true }],
  page: async ({ page, backend }, use) => {
    await installFakeBackend(page, backend);
    await use(page);
  },
});

export { expect } from "@playwright/test";

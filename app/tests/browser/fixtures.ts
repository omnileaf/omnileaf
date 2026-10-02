import { test as base } from "@playwright/test";

import { type FakeBackend, installFakeBackend } from "./fake-backend.ts";

export const FAKE_APP_VERSION = "1.2.3";

export const DEFAULT_BACKEND: FakeBackend = {
  appInfo: () => ({ version: FAKE_APP_VERSION, platform: "linux" }),
  addLibraryFolder: () => null,
};

export const test = base.extend<{ backend: FakeBackend }>({
  backend: [DEFAULT_BACKEND, { option: true }],
  page: async ({ page, backend }, use) => {
    await installFakeBackend(page, backend);
    await use(page);
  },
});

export { expect } from "@playwright/test";

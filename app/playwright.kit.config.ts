import { defineConfig } from "@playwright/test";

import { SCREENS } from "./playwright.config.ts";
import { TEST_BROWSER_CONTEXT } from "./tests/browser-context.ts";

const DEV_PORT = 4174;
const DEV_URL = `http://localhost:${String(DEV_PORT)}`;
const FIRST_COMPILE_MS = 30_000;

export default defineConfig({
  testDir: "tests/kit",
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  expect: { timeout: FIRST_COMPILE_MS },
  use: {
    ...TEST_BROWSER_CONTEXT,
    baseURL: DEV_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "ios", use: { browserName: "webkit", ...SCREENS.phone } },
    { name: "android", use: { browserName: "chromium", ...SCREENS.phone } },
  ],
  webServer: {
    command: `pnpm dev --port ${String(DEV_PORT)} --strictPort`,
    env: { VITE_SAMPLE_LIBRARY: "on", VITE_KIT_PAGE: "on" },
    url: DEV_URL,
    reuseExistingServer: false,
  },
});

import { defineConfig } from "@playwright/test";

const PREVIEW_PORT = 4174;
const PREVIEW_URL = `http://localhost:${String(PREVIEW_PORT)}`;

const SCREENS = {
  phone: {
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  desktop: {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
} as const;

const BROWSERS = ["chromium", "webkit"] as const;

export default defineConfig({
  testDir: "tests",
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  use: {
    locale: "en-US",
    timezoneId: "UTC",
    baseURL: PREVIEW_URL,
    trace: "retain-on-failure",
  },
  projects: BROWSERS.flatMap((browserName) =>
    Object.entries(SCREENS).map(([screen, device]) => ({
      name: `${browserName}-${screen}`,
      use: { browserName, ...device },
    })),
  ),
  webServer: {
    command: `pnpm build && pnpm preview --port ${String(PREVIEW_PORT)} --strictPort`,
    url: PREVIEW_URL,
    reuseExistingServer: false,
  },
});

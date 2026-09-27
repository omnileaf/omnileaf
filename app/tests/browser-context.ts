import type { BrowserContextOptions } from "@playwright/test";

export const TEST_BROWSER_CONTEXT = {
  locale: "en-US",
  timezoneId: "UTC",
} as const satisfies BrowserContextOptions;

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, FAKE_APP_VERSION, test } from "./fixtures.ts";

const PLATFORMS: readonly Platform[] = [
  "android",
  "ios",
  "macos",
  "windows",
  "linux",
];

for (const platform of PLATFORMS) {
  test.describe(`on ${platform}`, () => {
    test.use({
      backend: {
        ...DEFAULT_BACKEND,
        appInfo: () => ({ version: FAKE_APP_VERSION, platform }),
      },
    });

    test("marks the page with the platform the core reports", async ({
      page,
    }) => {
      await page.goto("/");

      await expect(page.locator("html")).toHaveAttribute(
        "data-platform",
        platform,
      );
    });
  });
}

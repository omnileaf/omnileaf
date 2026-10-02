import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { expect, onPlatform, test } from "./fixtures.ts";

const PLATFORMS: readonly Platform[] = [
  "android",
  "ios",
  "macos",
  "windows",
  "linux",
];

for (const platform of PLATFORMS) {
  test.describe(`on ${platform}`, () => {
    test.use(onPlatform(platform));

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

import type { Page } from "@playwright/test";

import {
  boxOf,
  EXPANDED_MIN_WIDTH,
  expect,
  MEDIUM_MIN_WIDTH,
  onPlatform,
  test,
  viewportOf,
} from "./fixtures.ts";

type SizeClass = "phone" | "tablet" | "desktop";

function sizeClassOf(page: Page): SizeClass {
  const { width } = viewportOf(page);
  if (width < MEDIUM_MIN_WIDTH) {
    return "phone";
  }
  return width < EXPANDED_MIN_WIDTH ? "tablet" : "desktop";
}

const LAYOUTS = [
  {
    platform: "android",
    titleGap: { phone: 16, tablet: 24, desktop: 24 },
    titleStart: { phone: 20, tablet: 28, desktop: 32 },
  },
  {
    platform: "linux",
    titleGap: { phone: 28, tablet: 28, desktop: 28 },
    titleStart: { phone: 24, tablet: 28, desktop: 32 },
  },
] as const;

for (const { platform, titleGap, titleStart } of LAYOUTS) {
  test.describe(`on ${platform}`, () => {
    test.use(onPlatform(platform));

    test("places the page title where the boards draw it", async ({ page }) => {
      await page.goto("/");
      const size = sizeClassOf(page);

      const heading = page.getByRole("heading", { level: 1, name: "Library" });
      const title = await boxOf(heading);
      const main = await boxOf(page.getByRole("main"));
      const textIndent = await heading.evaluate((element) =>
        parseFloat(getComputedStyle(element).paddingInlineStart),
      );

      expect(title.y).toBe(titleGap[size]);
      expect(title.x + textIndent - main.x).toBe(titleStart[size]);
    });
  });
}

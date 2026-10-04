import type { Page } from "@playwright/test";

import {
  boxOf,
  DEFAULT_BACKEND,
  EXPANDED_MIN_WIDTH,
  expect,
  FAKE_APP_VERSION,
  MEDIUM_MIN_WIDTH,
  test,
} from "./fixtures.ts";

const WINDOW_HEIGHT = 800;
const PANE_CONTENT_MIN_WIDTH = 300;
const LANGUAGES = ["en", "en-XA"] as const;
const SECTIONS = [
  "/settings/library",
  "/settings/appearance",
  "/settings/about",
] as const;

const OVERFLOWING_SCRIPT = `(() => {
  const overflowing = [];
  for (const element of document.querySelectorAll("main *")) {
    if (element.clientWidth > 0 && element.scrollWidth > element.clientWidth) {
      overflowing.push(element.outerHTML.slice(0, 120));
    }
  }
  if (document.documentElement.scrollWidth > window.innerWidth) {
    overflowing.push("the page");
  }
  return overflowing;
})()`;

async function openSection(page: Page, path: string): Promise<void> {
  await page.goto(path);
  if (path === "/settings/library") {
    await page.getByRole("main").getByRole("button").click();
    await expect(page.getByRole("main").getByRole("status")).not.toBeEmpty();
  }
}

for (const width of [MEDIUM_MIN_WIDTH, EXPANDED_MIN_WIDTH]) {
  test.describe(`in a ${String(width)}px desktop window`, () => {
    test.use({
      viewport: { width, height: WINDOW_HEIGHT },
      backend: {
        ...DEFAULT_BACKEND,
        appInfo: () => ({ version: FAKE_APP_VERSION, platform: "linux" }),
        addLibraryFolder: () => ({
          name: "Sample Library",
          comicFiles: 342,
          unreadableFolders: 2,
        }),
      },
    });

    for (const language of LANGUAGES) {
      for (const path of SECTIONS) {
        test(`fits ${path} beside the sections in ${language}`, async ({
          page,
        }) => {
          await page.addInitScript((chosen) => {
            window.localStorage.setItem("omnileaf.language", chosen);
          }, language);
          await openSection(page, path);

          const header = await boxOf(
            page.getByRole("heading", { level: 1 }).locator(".."),
          );
          const overflowing: unknown = await page.evaluate(OVERFLOWING_SCRIPT);

          expect(header.width).toBeGreaterThanOrEqual(PANE_CONTENT_MIN_WIDTH);
          expect(overflowing).toEqual([]);
        });
      }
    }
  });
}

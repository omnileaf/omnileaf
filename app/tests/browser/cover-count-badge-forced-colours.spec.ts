import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, fakeAppInfo, test } from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(3);
const FIRST_TITLE = LIBRARY[0]?.title ?? "";
const PLATFORMS: readonly Platform[] = [
  "android",
  "ios",
  "linux",
  "macos",
  "windows",
];
const NO_EDGE = "none";

function showing(platform: Platform): { backend: typeof DEFAULT_BACKEND } {
  return {
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: () => fakeAppInfo(platform),
      librarySeries: () => ({ series: LIBRARY, next: null }),
      librarySeriesCount: () => LIBRARY.length,
    },
  };
}

async function openUnderForcedColours(page: Page): Promise<Locator> {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/");
  await expect(page.getByText(FIRST_TITLE, { exact: true })).toBeVisible();
  return page.getByRole("img", { name: "1 unread" }).first();
}

function drawnEdge(badge: Locator): Promise<string> {
  return badge.evaluate((element, none) => {
    const style = getComputedStyle(element);
    const clear = ["transparent", "rgba(0, 0, 0, 0)"];
    if (
      style.outlineStyle !== "none" &&
      Number.parseFloat(style.outlineWidth) > 0 &&
      !clear.includes(style.outlineColor)
    ) {
      return `outline ${style.outlineWidth} ${style.outlineColor}`;
    }
    if (
      Number.parseFloat(style.borderTopWidth) > 0 &&
      !clear.includes(style.borderTopColor)
    ) {
      return `border ${style.borderTopWidth} ${style.borderTopColor}`;
    }
    return none;
  }, NO_EDGE);
}

for (const platform of PLATFORMS) {
  test.describe(`the cover count badge on ${platform} under forced colours`, () => {
    test.use(showing(platform));

    test("draws an edge the system colours show", async ({ page }) => {
      const badge = await openUnderForcedColours(page);
      test.skip(
        !(await page.evaluate(
          () => matchMedia("(forced-colors: active)").matches,
        )),
        "this engine cannot emulate forced colours",
      );

      expect(await drawnEdge(badge)).not.toBe(NO_EDGE);
    });
  });
}

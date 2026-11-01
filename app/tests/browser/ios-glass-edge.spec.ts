import type { Locator, Page } from "@playwright/test";

import type { Platform } from "../../src/lib/ipc/bindings.ts";
import {
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  MEDIUM_MIN_WIDTH,
  test,
  viewportOf,
} from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const LIBRARY = sampleSeries(3);
const FIRST_TITLE = LIBRARY[0]?.title ?? "";

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

async function openLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText(FIRST_TITLE, { exact: true })).toBeVisible();
}

const CLEAR_LAYER = "rgba(0, 0, 0, 0) 0px 0px 0px 0px";
const LAYER_SEPARATOR = /,(?![^(]*\))/;

function visibleLayers(boxShadow: string): string[] {
  return boxShadow
    .split(LAYER_SEPARATOR)
    .map((layer) => layer.trim())
    .filter((layer) => layer !== CLEAR_LAYER && layer !== "none");
}

async function glassOf(page: Page): Promise<string[]> {
  const computed = await page.evaluate((shadow) => {
    const probe = document.createElement("span");
    probe.style.boxShadow = shadow;
    document.body.append(probe);
    const boxShadow = getComputedStyle(probe).boxShadow;
    probe.remove();
    return boxShadow;
  }, "var(--native-shadow-shadow-glass)");
  return visibleLayers(computed);
}

function shadowOf(element: Locator): Promise<string[]> {
  return element
    .evaluate((node) => getComputedStyle(node).boxShadow)
    .then(visibleLayers);
}

function mainBar(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" });
}

function more(page: Page): Locator {
  return page.getByRole("main").getByRole("button", { name: "More" });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`the iOS glass edge in ${scheme}`, () => {
    test.use({ colorScheme: scheme, ...showing("ios") });

    test("rims the tab bar with the glass edge and shadow", async ({
      page,
    }) => {
      await openLibrary(page);

      expect(await shadowOf(mainBar(page))).toEqual(await glassOf(page));
    });

    test("rims the More button with the glass edge and shadow", async ({
      page,
    }) => {
      await openLibrary(page);

      expect(await shadowOf(more(page))).toEqual(await glassOf(page));
    });

    test("rims the Search button with the glass edge and shadow", async ({
      page,
    }) => {
      test.skip(
        viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "iPads leave the bar row to the tab bar",
      );
      await openLibrary(page);

      expect(
        await shadowOf(
          page.getByRole("main").getByRole("link", { name: "Search" }),
        ),
      ).toEqual(await glassOf(page));
    });
  });

  test.describe(`Android's bars in ${scheme}`, () => {
    test.use({ colorScheme: scheme, ...showing("android") });

    test("keep their own flat look with no glass edge", async ({ page }) => {
      test.skip(
        viewportOf(page).width >= MEDIUM_MIN_WIDTH,
        "Android's tablets draw a rail",
      );
      await openLibrary(page);

      expect(await shadowOf(mainBar(page))).toEqual([]);
      expect(await shadowOf(more(page))).toEqual([]);
    });
  });
}

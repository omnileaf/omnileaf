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

type Scheme = "light" | "dark";

const GLASS_SHADOW = {
  light:
    "0 0 0 0.5px rgba(0, 0, 0, 0.12), -1px 0 0 -0.25px rgba(0, 0, 0, 0.22), 1px 0 0 -0.25px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.7), inset 0 -1px 0 rgba(255, 255, 255, 0.7), inset 0 6px 6px -6px rgba(255, 255, 255, 0.3), inset 0 -12px 10px -6px rgba(255, 255, 255, 0.4), 0 8px 15px rgba(0, 0, 0, 0.02)",
  dark: "0 0 0 0.5px rgba(0, 0, 0, 0.8), -1px 0 0 -0.25px rgba(0, 0, 0, 0.3), 1px 0 0 -0.25px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(255, 255, 255, 0.2), inset 0 6px 6px -6px rgba(255, 255, 255, 0.05), inset 0 -12px 10px -6px rgba(255, 255, 255, 0.06), 0 8px 15px rgba(0, 0, 0, 0.04)",
};

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

async function glassOf(page: Page, scheme: Scheme): Promise<string[]> {
  const computed = await page.evaluate((shadow) => {
    const probe = document.createElement("span");
    probe.style.boxShadow = shadow;
    document.body.append(probe);
    const boxShadow = getComputedStyle(probe).boxShadow;
    probe.remove();
    return boxShadow;
  }, GLASS_SHADOW[scheme]);
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

for (const scheme of ["light", "dark"] as const satisfies Scheme[]) {
  test.describe(`the iOS glass edge in ${scheme}`, () => {
    test.use({ colorScheme: scheme, ...showing("ios") });

    test("rims the tab bar with the glass edge and shadow", async ({
      page,
    }) => {
      await openLibrary(page);

      expect(await shadowOf(mainBar(page))).toEqual(
        await glassOf(page, scheme),
      );
    });

    test("rims the More button with the glass edge and shadow", async ({
      page,
    }) => {
      await openLibrary(page);

      expect(await shadowOf(more(page))).toEqual(await glassOf(page, scheme));
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
      ).toEqual(await glassOf(page, scheme));
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

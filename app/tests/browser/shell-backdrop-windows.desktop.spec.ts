import type { Locator, Page } from "@playwright/test";

import type {
  MissingFolder,
  WindowBackdrop,
} from "../../src/lib/ipc/bindings.ts";
import { CommandFailure, type FakeBackend } from "./fake-backend.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";
import { openSortAndFilter } from "./library-controls.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const TRANSPARENT = "rgba(0, 0, 0, 0)";
const LEAST_TEXT_CONTRAST = 4.5;

/** DWM paints Mica as a flat fill of these colours while the window is out of focus or Mica cannot draw, per the Windows kit's window colour. */
const MICA_FALLBACK = { light: "#f3f3f3", dark: "#202020" } as const;

type ColorScheme = keyof typeof MICA_FALLBACK;

const LIBRARY = sampleSeries(12);

const MISSING_FOLDER = {
  folder: {
    id: "5a4d1e00-0000-4000-8002-000000000002",
    kind: "linked",
    name: "Comics",
    location: "/media/Comics",
    isAvailable: false,
  },
  problem: { kind: "missing" },
  hiddenSeries: 4,
  isShownAnyway: false,
} as MissingFolder;

function onWindowsWith(
  backdrop: WindowBackdrop,
  backend: Partial<FakeBackend> = {},
) {
  return {
    backend: {
      ...DEFAULT_BACKEND,
      librarySeries: pagedSeries(() => LIBRARY),
      librarySeriesCount: () => LIBRARY.length,
      missingLibraryFolders: () => [MISSING_FOLDER],
      libraryHiddenSeriesCount: () => MISSING_FOLDER.hiddenSeries,
      appInfo: () => ({ ...fakeAppInfo("windows"), windowBackdrop: backdrop }),
      ...backend,
    },
  };
}

function navigation(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" });
}

function shellOf(page: Page): Locator {
  return navigation(page).locator("..");
}

function attentionItem(page: Page): Locator {
  return navigation(page).getByRole("button", { name: /^Needs attention/ });
}

async function openSettings(page: Page, colorScheme: ColorScheme) {
  await page.emulateMedia({ colorScheme });
  await page.goto("/settings/general");
  await expect(page.getByRole("main")).toBeVisible();
}

async function openLibrary(page: Page, colorScheme: ColorScheme) {
  await page.emulateMedia({ colorScheme });
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
}

function ringOfAttentionDot(item: Locator) {
  return item.evaluate(
    (button) =>
      [...button.querySelectorAll("span")]
        .map((part) => getComputedStyle(part).boxShadow)
        .find((shadow) => shadow !== "none") ?? "none",
  );
}

/** A browser window has no Mica behind it, so the page's own canvas stands in with the colour Mica falls back to. */
async function drawMicaFallbackBehind(page: Page, colorScheme: ColorScheme) {
  await page.addStyleTag({
    content: `html { background-color: ${MICA_FALLBACK[colorScheme]}; }`,
  });
}

function inkOverFallback(navigation: Locator, fallback: string) {
  return navigation.evaluate((pane, ground) => {
    const context = document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true });
    if (context === null) {
      throw new Error("the browser has no 2D canvas");
    }
    const painted = (colours: string[]) => {
      context.clearRect(0, 0, 1, 1);
      for (const colour of colours) {
        context.fillStyle = colour;
        context.fillRect(0, 0, 1, 1);
      }
      const [red = 0, green = 0, blue = 0] = context.getImageData(
        0,
        0,
        1,
        1,
      ).data;
      return [red, green, blue];
    };
    const linear = (channel: number) => {
      const fraction = channel / 255;
      return fraction <= 0.04045
        ? fraction / 12.92
        : ((fraction + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([red = 0, green = 0, blue = 0]: number[]) =>
      0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
    const layersUnder = (element: Element) => {
      const layers = [];
      for (
        let at: Element | null = element;
        at !== null && pane.contains(at);
        at = at.parentElement
      ) {
        layers.unshift(getComputedStyle(at).backgroundColor);
      }
      return [ground, ...layers];
    };
    const showsInk = (element: Element) =>
      element.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      }) &&
      (element instanceof SVGSVGElement ||
        [...element.childNodes].some(
          (node) => node instanceof Text && node.data.trim() !== "",
        ));
    return [...pane.querySelectorAll("*")].filter(showsInk).map((element) => {
      const layers = layersUnder(element);
      const groundLuminance = luminance(painted(layers));
      const inkLuminance = luminance(
        painted([...layers, getComputedStyle(element).color]),
      );
      const ratio =
        (Math.max(groundLuminance, inkLuminance) + 0.05) /
        (Math.min(groundLuminance, inkLuminance) + 0.05);
      return {
        ink: element.textContent.trim() || element.tagName,
        ratio: Math.round(ratio * 100) / 100,
      };
    });
  }, fallback);
}

test.describe("on Windows", () => {
  testOnlyInItsWebview("windows");

  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`on Mica in the ${colorScheme} theme`, () => {
      test.use(onWindowsWith("mica"));

      test("lets Mica show through the pane and keeps the page on a solid layer", async ({
        page,
      }) => {
        await openSettings(page, colorScheme);

        await expect(navigation(page)).toHaveCSS(
          "background-color",
          TRANSPARENT,
        );
        await expect(shellOf(page)).toHaveCSS("background-color", TRANSPARENT);
        await expect(page.locator("body")).toHaveCSS(
          "background-color",
          TRANSPARENT,
        );
        await expect(page.getByRole("main")).toHaveCSS(
          "background-color",
          await tokenColour(page, "--windows-layer-solid"),
        );
      });

      test("keeps the pane's text and icons readable on Mica's fallback colour", async ({
        page,
      }) => {
        await openSettings(page, colorScheme);

        const inks = await inkOverFallback(
          navigation(page),
          MICA_FALLBACK[colorScheme],
        );

        expect(inks.length).toBeGreaterThan(0);
        expect(inks.filter(({ ratio }) => ratio < LEAST_TEXT_CONTRAST)).toEqual(
          [],
        );
      });

      test("keeps the docked Sort and filter pane on its solid pane fill", async ({
        page,
      }) => {
        await openLibrary(page, colorScheme);
        await openSortAndFilter(page);

        await expect(
          page.getByRole("complementary", { name: "Sort and filter" }),
        ).toHaveCSS(
          "background-color",
          await tokenColour(page, "--windows-mica"),
        );
      });

      test("lays Windows' translucent subtle fill under a section the pointer rests on", async ({
        page,
      }) => {
        await openLibrary(page, colorScheme);
        const settings = navigation(page).getByRole("link", {
          name: "Settings",
        });

        await settings.hover();

        await expect(settings).toHaveCSS(
          "background-color",
          await tokenColour(page, "--native-color-nav-item-hover"),
        );
        const inks = await inkOverFallback(
          navigation(page),
          MICA_FALLBACK[colorScheme],
        );
        expect(inks.filter(({ ratio }) => ratio < LEAST_TEXT_CONTRAST)).toEqual(
          [],
        );
      });

      test("lays the same translucent fill under the open Needs attention item", async ({
        page,
      }) => {
        await openLibrary(page, colorScheme);

        await attentionItem(page).click();

        await expect(attentionItem(page)).toHaveCSS(
          "background-color",
          await tokenColour(page, "--native-color-nav-item-hover"),
        );
      });

      test("draws the folded pane's attention count as an info badge and no dot", async ({
        page,
      }) => {
        await openLibrary(page, colorScheme);
        await page.keyboard.press("Control+b");

        expect(await ringOfAttentionDot(attentionItem(page))).toBe("none");
        await expect(attentionItem(page)).toContainText(/\d/);
      });

      test("has no accessibility violations", async ({ page }) => {
        await openSettings(page, colorScheme);
        await drawMicaFallbackBehind(page, colorScheme);

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    });

    test.describe(`on Mica with forced colours in the ${colorScheme} theme`, () => {
      test.use(onWindowsWith("mica"));

      test("paints the pane and the window in the system's Canvas colour", async ({
        page,
      }) => {
        await page.emulateMedia({ forcedColors: "active" });
        await openSettings(page, colorScheme);

        await expect(navigation(page)).not.toHaveCSS(
          "background-color",
          TRANSPARENT,
        );
        await expect(shellOf(page)).not.toHaveCSS(
          "background-color",
          TRANSPARENT,
        );
        await expect(page.locator("body")).not.toHaveCSS(
          "background-color",
          TRANSPARENT,
        );
      });
    });

    test.describe(`on Mica before the window takes the app's theme in the ${colorScheme} theme`, () => {
      test.use(
        onWindowsWith("mica", {
          matchSystemBars: () => {
            throw new CommandFailure({
              code: "internal",
              message: "the window keeps the system's theme",
            });
          },
        }),
      );

      test("keeps the pane solid", async ({ page }) => {
        await openSettings(page, colorScheme);

        await expect(navigation(page)).toHaveCSS(
          "background-color",
          await tokenColour(page, "--windows-mica"),
        );
      });
    });

    test.describe(`without a backdrop in the ${colorScheme} theme`, () => {
      test.use(onWindowsWith("none"));

      test("paints the pane and the page solid", async ({ page }) => {
        await openSettings(page, colorScheme);

        await expect(navigation(page)).toHaveCSS(
          "background-color",
          await tokenColour(page, "--windows-mica"),
        );
        await expect(page.locator("body")).toHaveCSS(
          "background-color",
          await tokenColour(page, "--windows-layer-solid"),
        );
        await expect(page.getByRole("main")).toHaveCSS(
          "background-color",
          await tokenColour(page, "--windows-layer-solid"),
        );
      });

      test("has no accessibility violations", async ({ page }) => {
        await openSettings(page, colorScheme);

        expect(await accessibilityViolations(page)).toEqual([]);
      });
    });
  }
});

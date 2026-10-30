import type { Locator, Page } from "@playwright/test";

import type { WindowBackdrop } from "../../src/lib/ipc/bindings.ts";
import {
  accessibilityViolations,
  DEFAULT_BACKEND,
  expect,
  fakeAppInfo,
  test,
  testOnlyInItsWebview,
  tokenColour,
} from "./fixtures.ts";

const TRANSPARENT = "rgba(0, 0, 0, 0)";
const LEAST_TEXT_CONTRAST = 4.5;

/** DWM paints Mica as a flat fill of these colours while the window is out of focus or Mica cannot draw, per the Windows kit's window colour. */
const MICA_FALLBACK = { light: "#f3f3f3", dark: "#202020" } as const;

type ColorScheme = keyof typeof MICA_FALLBACK;

function onWindowsWith(backdrop: WindowBackdrop) {
  return {
    backend: {
      ...DEFAULT_BACKEND,
      appInfo: () => ({ ...fakeAppInfo("windows"), windowBackdrop: backdrop }),
    },
  };
}

function navigation(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" });
}

function shellOf(page: Page): Locator {
  return navigation(page).locator("..");
}

async function openSettings(page: Page, colorScheme: ColorScheme) {
  await page.emulateMedia({ colorScheme });
  await page.goto("/settings/general");
  await expect(page.getByRole("main")).toBeVisible();
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

      test("has no accessibility violations", async ({ page }) => {
        await openSettings(page, colorScheme);
        await drawMicaFallbackBehind(page, colorScheme);

        expect(await accessibilityViolations(page)).toEqual([]);
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

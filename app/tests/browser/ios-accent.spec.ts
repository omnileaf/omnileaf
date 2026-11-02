import type { Page } from "@playwright/test";

import { expect, test, testOnlyInItsWebview } from "./fixtures.ts";

testOnlyInItsWebview("ios");

interface Drawn {
  readonly fill: string;
  readonly onFill: string;
  readonly ink: string;
}

async function drawnAccent(page: Page): Promise<Drawn> {
  return page.evaluate(() => {
    const drawn = (name: string, property: "color" | "backgroundColor") => {
      const probe = document.createElement("span");
      probe.className = name;
      (document.querySelector("[data-theme]") ?? document.body).append(probe);
      const colour = getComputedStyle(probe)[property];
      probe.remove();
      return colour;
    };
    return {
      fill: drawn("bg-accent", "backgroundColor"),
      onFill: drawn("text-on-accent", "color"),
      ink: drawn("text-accent", "color"),
    };
  });
}

async function asPixels(page: Page, drawn: Drawn): Promise<number[][]> {
  return page.evaluate((colours) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const pixel = (css: string): number[] => {
      context?.clearRect(0, 0, 1, 1);
      if (context !== null) {
        context.fillStyle = css;
        context.fillRect(0, 0, 1, 1);
      }
      return [...(context?.getImageData(0, 0, 1, 1).data ?? [])];
    };
    return [colours.fill, colours.onFill, colours.ink].map(pixel);
  }, drawn);
}

for (const [scheme, fill, onFill, ink] of [
  ["light", "#2f6f4f", "#ffffff", "#2f6f4f"],
  ["dark", "#7fcb9d", "#0f2418", "#7fcb9d"],
] as const) {
  test(
    `draws the accent in Omnileaf green in the ${scheme} theme`,
    { tag: "@native" },
    async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/settings");
      await page.waitForFunction(
        () => document.documentElement.dataset.platform !== undefined,
      );

      const drawn = await drawnAccent(page);

      expect(await asPixels(page, drawn)).toEqual(
        await asPixels(page, { fill, onFill, ink }),
      );
    },
  );
}

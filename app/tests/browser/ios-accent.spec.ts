import type { Page } from "@playwright/test";

import {
  expect,
  literalColour,
  test,
  testOnlyInItsWebview,
} from "./fixtures.ts";

testOnlyInItsWebview("ios");

interface Drawn {
  readonly fill: string;
  readonly onFill: string;
  readonly ink: string;
  readonly soft: string;
}

async function drawnAccent(page: Page): Promise<Drawn> {
  return page.evaluate(() => {
    const drawn = (name: string, property: "color" | "backgroundColor") => {
      const probe = document.createElement("span");
      probe.className = name;
      document.body.append(probe);
      const colour = getComputedStyle(probe)[property];
      probe.remove();
      return colour;
    };
    return {
      fill: drawn("bg-accent", "backgroundColor"),
      onFill: drawn("text-on-accent", "color"),
      ink: drawn("text-accent", "color"),
      soft: drawn("bg-accent-soft", "backgroundColor"),
    };
  });
}

for (const [scheme, fill, onFill, ink, soft] of [
  ["light", "#2f6f4f", "#ffffff", "#2f6f4f", "#ddebe2"],
  ["dark", "#7fcb9d", "#0f2418", "#7fcb9d", "#243a2c"],
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

      expect(drawn).toEqual({
        fill: await literalColour(page, fill),
        onFill: await literalColour(page, onFill),
        ink: await literalColour(page, ink),
        soft: await literalColour(page, soft),
      });
    },
  );
}

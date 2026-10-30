import { afterEach, expect, test } from "vitest";

import "../../app.css";

import { followWallpaperColours } from "#lib/appearance/wallpaper-colours.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { contrastRatio } from "../../../tests/components/contrast-ratio";
import { resolvedColour } from "../../../tests/components/resolved-colour";
import { BLUE_WALLPAPER } from "../../../tests/sample-wallpaper";
import source from "./tokens.json";

type Pair = readonly [ink: string, ground: string];

const TEXT_RATIO = 4.5;
const MARK_RATIO = 3;
const THEMES = ["light", "dark"] as const;
const WALLPAPER_VALUE = /^android-(light|dark)-colours-wallpaper$/;
const WALLPAPER_ROLE = /--android-wallpaper-(light|dark)-[a-z-]+/g;

const TEXT: readonly Pair[] = [
  ["on-top-bar", "top-bar-scrolled"],
  ["on-tab", "tab-bar"],
  ["on-tab-current", "tab-bar"],
  ["on-tab-pill", "tab-pill"],
  ["on-jump-current", "jump-current"],
  ["on-menu", "menu"],
  ["on-menu-chosen", "menu-chosen"],
  ["on-notice", "notice"],
  ["on-notice-action", "notice"],
  ["on-button-primary", "button-primary"],
  ["on-button-secondary", "button-secondary"],
  ["on-button-plain", "card"],
  ["on-segment", "segment-fill"],
  ["on-segment-selected", "segment-selected"],
];

const MARKS: readonly Pair[] = [
  ["button-outline-edge", "card"],
  ["switch-off-border", "card"],
];

async function showBlueWallpaper(
  theme: (typeof THEMES)[number],
): Promise<void> {
  followCorePlatform("android");
  document.documentElement.dataset.theme = theme;
  await followWallpaperColours("android", "wallpaper", {
    wallpaperColours: () =>
      Promise.resolve({ status: "ok", data: BLUE_WALLPAPER }),
    accentColours: () => Promise.resolve(null),
  });
}

afterEach(async () => {
  await followWallpaperColours("android", "omnileaf");
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test.each(THEMES)(
  "draws the primary button in the wallpaper's primary in %s",
  async (theme) => {
    await showBlueWallpaper(theme);

    expect(resolvedColour("--native-color-button-primary", "color")).toBe(
      theme === "light" ? "rgb(65, 97, 137)" : "rgb(177, 200, 236)",
    );
  },
);

test.each(THEMES)(
  `holds text at ${String(TEXT_RATIO)}:1 and marks at ${String(MARK_RATIO)}:1 on a sample wallpaper in %s`,
  async (theme) => {
    await showBlueWallpaper(theme);

    for (const [ink, ground] of TEXT) {
      expect(
        contrastRatio(ink, ground),
        `${ink} on ${ground}`,
      ).toBeGreaterThanOrEqual(TEXT_RATIO);
    }
    for (const [ink, ground] of MARKS) {
      expect(
        contrastRatio(ink, ground),
        `${ink} on ${ground}`,
      ).toBeGreaterThanOrEqual(MARK_RATIO);
    }
  },
);

test("takes each theme's wallpaper colours only from that theme", () => {
  const crossed = source.tokens.flatMap((token) =>
    Object.entries(token.value).flatMap(([key, value]) => {
      const theme = WALLPAPER_VALUE.exec(key)?.[1];
      const used = [...value.matchAll(WALLPAPER_ROLE)].map(([, used]) => used);
      return theme !== undefined && used.some((other) => other !== theme)
        ? [`${token.name} ${key}`]
        : [];
    }),
  );

  expect(crossed).toEqual([]);
});

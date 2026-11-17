import { afterEach, expect, test } from "vitest";

import "../../app.css";

import { followWallpaperColours } from "#lib/appearance/wallpaper-colours.ts";
import type { WallpaperColours } from "#lib/ipc/bindings.ts";
import { type Contrast, followContrast } from "#lib/page/display-modes.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { contrastRatio } from "../../../tests/components/contrast-ratio";
import { resolvedColour } from "../../../tests/components/resolved-colour";
import {
  BLUE_WALLPAPER,
  MUTED_WALLPAPER_BY_CONTRAST,
} from "../../../tests/sample-wallpaper";
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
  ["on-tab-bar-current", "tab-bar"],
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

const TAB_BAR_GROUNDS: ReadonlySet<string> = new Set(["tab-bar", "tab-pill"]);

const TAB_BAR_TEXT = TEXT.filter(([, ground]) => TAB_BAR_GROUNDS.has(ground));

const CONTRAST_LEVELS: readonly {
  readonly level: keyof typeof MUTED_WALLPAPER_BY_CONTRAST;
  readonly contrast: Contrast | undefined;
}[] = [
  { level: "standard", contrast: undefined },
  { level: "medium", contrast: "medium" },
  { level: "high", contrast: "high" },
];

const TAB_BAR_STATES = (["omnileaf", "wallpaper"] as const).flatMap((colours) =>
  THEMES.flatMap((theme) =>
    CONTRAST_LEVELS.map((level) => ({ colours, theme, ...level })),
  ),
);

const SAMPLES = [
  { sample: "blue", contrast: undefined, wallpaper: BLUE_WALLPAPER },
  ...CONTRAST_LEVELS.map(({ level, contrast }) => ({
    sample: `muted at ${level} contrast`,
    contrast,
    wallpaper: MUTED_WALLPAPER_BY_CONTRAST[level],
  })),
].flatMap((sample) => THEMES.map((theme) => ({ ...sample, theme })));

const MARKS: readonly Pair[] = [
  ["button-outline-edge", "card"],
  ["switch-off-border", "card"],
];

async function showWallpaper(
  theme: (typeof THEMES)[number],
  wallpaper: WallpaperColours,
  colours: "omnileaf" | "wallpaper" = "wallpaper",
): Promise<void> {
  followCorePlatform("android");
  document.documentElement.dataset.theme = theme;
  await followWallpaperColours("android", colours, {
    wallpaperColours: () => Promise.resolve({ status: "ok", data: wallpaper }),
    accentColours: () => Promise.resolve(null),
  });
}

afterEach(async () => {
  await followWallpaperColours("android", "omnileaf");
  followContrast(undefined);
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test.each(THEMES)(
  "draws the primary button in the wallpaper's primary in %s",
  async (theme) => {
    await showWallpaper(theme, BLUE_WALLPAPER);

    expect(resolvedColour("--native-color-button-primary", "color")).toBe(
      theme === "light" ? "rgb(65, 97, 137)" : "rgb(177, 200, 236)",
    );
  },
);

test.each(SAMPLES)(
  `holds text at ${String(TEXT_RATIO)}:1 and marks at ${String(MARK_RATIO)}:1 on the $sample wallpaper in $theme`,
  async ({ theme, contrast, wallpaper }) => {
    followContrast(contrast);
    await showWallpaper(theme, wallpaper);

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

test.each(TAB_BAR_STATES)(
  "keeps the tab bar's text readable with $colours colours in $theme at $level contrast",
  async ({ colours, theme, level, contrast }) => {
    followContrast(contrast);
    await showWallpaper(theme, MUTED_WALLPAPER_BY_CONTRAST[level], colours);

    for (const [ink, ground] of TAB_BAR_TEXT) {
      expect(
        contrastRatio(ink, ground),
        `${ink} on ${ground}`,
      ).toBeGreaterThanOrEqual(TEXT_RATIO);
    }
  },
);

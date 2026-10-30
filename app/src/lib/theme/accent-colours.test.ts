import { afterEach, expect, test } from "vitest";

import "../../app.css";

import { followWallpaperColours } from "#lib/appearance/wallpaper-colours.ts";
import type { AccentColours, Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { contrastRatio } from "../../../tests/components/contrast-ratio";
import { resolvedColour } from "../../../tests/components/resolved-colour";
import { BLUE_ACCENT } from "../../../tests/sample-wallpaper";

type Theme = (typeof THEMES)[number];

const TEXT_RATIO = 4.5;
const MARK_RATIO = 3;
const THEMES = ["light", "dark"] as const;
const BLUE_SHADES = {
  light: "rgb(0, 103, 192)",
  dark: "rgb(76, 194, 255)",
} satisfies Record<Theme, string>;
const BLUE_TEXT = {
  light: "rgb(0, 62, 146)",
  dark: "rgb(153, 235, 255)",
} satisfies Record<Theme, string>;
const LIGHT_YELLOW_ACCENT: AccentColours = {
  light: 0xfff176,
  dark: 0xfff59d,
  lightText: 0x7a6a00,
  darkText: 0xfffbd0,
};
const DARK_NAVY_ACCENT: AccentColours = {
  light: 0x1a237e,
  dark: 0x283593,
  lightText: 0x0d1450,
  darkText: 0x9fa8da,
};
const WINDOWS_SURFACES = ["--background", "--card"];
const ELSEWHERE: readonly Platform[] = ["android", "ios", "linux", "macos"];

async function showAccent(
  platform: Platform,
  theme: Theme,
  accent: AccentColours = BLUE_ACCENT,
): Promise<void> {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  await followWallpaperColours(platform, "wallpaper", {
    wallpaperColours: () => Promise.resolve({ status: "ok", data: null }),
    accentColours: () => Promise.resolve(accent),
  });
}

function withOmnileafColours(platform: Platform, theme: Theme): void {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
}

function accentTextColour(): string {
  const probe = document.createElement("span");
  probe.className = "text-accent";
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

afterEach(async () => {
  await followWallpaperColours("windows", "omnileaf");
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test.each(THEMES)(
  "draws the primary colour in the Windows accent in %s",
  async (theme) => {
    await showAccent("windows", theme);

    expect(resolvedColour("--primary", "color")).toBe(BLUE_SHADES[theme]);
  },
);

test.each(THEMES)(
  "writes accent text in the shade Windows writes it in in %s",
  async (theme) => {
    await showAccent("windows", theme);

    expect(accentTextColour()).toBe(BLUE_TEXT[theme]);
  },
);

test.each(THEMES)(
  `holds accent text at ${String(TEXT_RATIO)}:1 on the Windows surfaces in %s`,
  async (theme) => {
    await showAccent("windows", theme);

    for (const surface of WINDOWS_SURFACES) {
      expect(
        contrastRatio(`--windows-accent-text-${theme}`, surface),
        surface,
      ).toBeGreaterThanOrEqual(TEXT_RATIO);
    }
  },
);

test.each(
  THEMES.flatMap((theme) => [
    { theme, name: "light yellow", accent: LIGHT_YELLOW_ACCENT },
    { theme, name: "dark navy", accent: DARK_NAVY_ACCENT },
    { theme, name: "default blue", accent: BLUE_ACCENT },
  ]),
)(
  `holds labels on a $name accent at ${String(TEXT_RATIO)}:1 and switch thumbs at ${String(MARK_RATIO)}:1 in $theme`,
  async ({ theme, accent }) => {
    await showAccent("windows", theme, accent);

    expect(
      contrastRatio("on-button-primary", "button-primary"),
    ).toBeGreaterThanOrEqual(TEXT_RATIO);
    expect(contrastRatio("switch-thumb", "switch-on")).toBeGreaterThanOrEqual(
      MARK_RATIO,
    );
  },
);

test.each(THEMES)(
  "keeps the label WinUI draws on the default blue accent in %s",
  async (theme) => {
    await showAccent("windows", theme);

    expect(resolvedColour("--native-color-on-button-primary", "color")).toBe(
      theme === "light" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)",
    );
  },
);

test.each(ELSEWHERE)(
  "keeps the primary colour and accent text on %s when the accent is offered",
  async (platform) => {
    withOmnileafColours(platform, "light");
    const omnileaf = [resolvedColour("--primary", "color"), accentTextColour()];

    await showAccent(platform, "light");

    expect([resolvedColour("--primary", "color"), accentTextColour()]).toEqual(
      omnileaf,
    );
  },
);

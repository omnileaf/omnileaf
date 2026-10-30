import { afterEach, expect, test } from "vitest";

import "../../app.css";

import { followWallpaperColours } from "#lib/appearance/wallpaper-colours.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { contrastRatio } from "../../../tests/components/contrast-ratio";
import { resolvedColour } from "../../../tests/components/resolved-colour";
import { BLUE_ACCENT } from "../../../tests/sample-wallpaper";

const TEXT_RATIO = 4.5;
const THEMES = ["light", "dark"] as const;
const BLUE_SHADES = {
  light: "rgb(0, 103, 192)",
  dark: "rgb(76, 194, 255)",
} satisfies Record<(typeof THEMES)[number], string>;
const ELSEWHERE: readonly Platform[] = ["android", "ios", "linux", "macos"];

async function showBlueAccent(
  platform: Platform,
  theme: (typeof THEMES)[number],
): Promise<void> {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  await followWallpaperColours(platform, "wallpaper", {
    wallpaperColours: () => Promise.resolve({ status: "ok", data: null }),
    accentColours: () => Promise.resolve(BLUE_ACCENT),
  });
}

function primaryWithOmnileafColours(
  platform: Platform,
  theme: (typeof THEMES)[number],
): string {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  return resolvedColour("--primary", "color");
}

afterEach(async () => {
  await followWallpaperColours("windows", "omnileaf");
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

test.each(THEMES)(
  "draws the primary colour in the Windows accent in %s",
  async (theme) => {
    await showBlueAccent("windows", theme);

    expect(resolvedColour("--primary", "color")).toBe(BLUE_SHADES[theme]);
  },
);

test.each(THEMES)(
  `holds the primary button's label at ${String(TEXT_RATIO)}:1 on the Windows accent in %s`,
  async (theme) => {
    await showBlueAccent("windows", theme);

    expect(
      contrastRatio("on-button-primary", "button-primary"),
    ).toBeGreaterThanOrEqual(TEXT_RATIO);
  },
);

test.each(ELSEWHERE)(
  "keeps the primary colour on %s when the accent is offered",
  async (platform) => {
    const omnileafPrimary = primaryWithOmnileafColours(platform, "light");

    await showBlueAccent(platform, "light");

    expect(resolvedColour("--primary", "color")).toBe(omnileafPrimary);
  },
);

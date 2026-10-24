import { afterEach, expect, test } from "vitest";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { type Contrast, followDisplayModes } from "#lib/page/display-modes.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

type Pair = readonly [ink: string, ground: string];

type Channels = readonly [red: number, green: number, blue: number];

interface ContrastCase {
  readonly platform: Platform;
  readonly contrast: Contrast;
  readonly text: readonly Pair[];
  readonly marks: readonly Pair[];
}

const TEXT_RATIO = 4.5;
const MARK_RATIO = 3;

const IOS_TEXT: readonly Pair[] = [
  ["on-button-plain", "card"],
  ["on-button-plain", "grouped-ground"],
  ["on-button-primary", "button-primary"],
  ["on-notice-action", "notice-action"],
];

const ANDROID_TEXT: readonly Pair[] = [
  ["on-top-bar", "top-bar-scrolled"],
  ["on-tab", "tab-bar"],
  ["on-tab-current", "tab-bar"],
  ["on-tab-pill", "tab-pill"],
  ["on-menu", "menu"],
  ["on-menu-chosen", "menu-chosen"],
  ["on-notice", "notice"],
  ["on-notice-action", "notice"],
  ["on-button-primary", "button-primary"],
  ["on-button-secondary", "button-secondary"],
  ["on-button-plain", "card"],
  ["on-button-destructive", "card"],
  ["on-segment", "segment-fill"],
  ["on-segment-selected", "segment-selected"],
];

const ANDROID_MARKS: readonly Pair[] = [
  ["focus-ring", "card"],
  ["focus-ring", "sheet"],
  ["button-outline-edge", "card"],
  ["switch-off-border", "card"],
];

const CASES: readonly ContrastCase[] = [
  {
    platform: "ios",
    contrast: "more",
    text: IOS_TEXT,
    marks: [
      ["focus-ring", "card"],
      ["focus-ring", "grouped-ground"],
    ],
  },
  {
    platform: "android",
    contrast: "medium",
    text: ANDROID_TEXT,
    marks: ANDROID_MARKS,
  },
  {
    platform: "android",
    contrast: "high",
    text: ANDROID_TEXT,
    marks: ANDROID_MARKS,
  },
];

const THEMES = ["light", "dark"] as const;

const OPAQUE = 255;

function paint(tokens: readonly string[]): Uint8ClampedArray {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    throw new Error("The test browser has no 2D canvas");
  }
  for (const token of tokens) {
    context.fillStyle = resolvedColour(`--native-color-${token}`, "color");
    context.fillRect(0, 0, 1, 1);
  }
  return context.getImageData(0, 0, 1, 1).data;
}

function channels(token: string): Channels {
  const [red = 0, green = 0, blue = 0, alpha] = paint([token]);
  if (alpha !== OPAQUE) {
    throw new Error(`${token} is not an opaque colour`);
  }
  return [red, green, blue];
}

function paintedChannels([ink, ground]: Pair): Channels {
  const [red = 0, green = 0, blue = 0] = paint([ground, ink]);
  return [red, green, blue];
}

function linear(channel: number): number {
  const fraction = channel / 255;
  return fraction <= 0.04045
    ? fraction / 12.92
    : ((fraction + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([red, green, blue]: Channels): number {
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function ratio(ink: Channels, ground: Channels): number {
  const luminances = [relativeLuminance(ink), relativeLuminance(ground)];
  return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
}

function contrastRatio([ink, ground]: Pair): number {
  return ratio(channels(ink), channels(ground));
}

function paintedRatio(pair: Pair): number {
  return ratio(paintedChannels(pair), channels(pair[1]));
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  followDisplayModes({ contrast: undefined, transparency: undefined });
});

for (const { platform, contrast, text, marks } of CASES) {
  for (const theme of THEMES) {
    test(`holds text at ${String(TEXT_RATIO)}:1 and marks at ${String(MARK_RATIO)}:1 on ${platform} in ${theme} with ${contrast} contrast`, () => {
      followCorePlatform(platform);
      document.documentElement.dataset.theme = theme;

      followDisplayModes({ contrast, transparency: undefined });

      for (const pair of text) {
        expect(contrastRatio(pair), pair.join(" on ")).toBeGreaterThanOrEqual(
          TEXT_RATIO,
        );
      }
      for (const pair of marks) {
        expect(contrastRatio(pair), pair.join(" on ")).toBeGreaterThanOrEqual(
          MARK_RATIO,
        );
      }
    });
  }
}

for (const { platform, contrast, marks } of CASES) {
  const rings = marks.filter(([ink]) => ink === "focus-ring");
  for (const theme of THEMES) {
    test(`draws the focus ring at least as strongly on ${platform} in ${theme} with ${contrast} contrast as without it`, () => {
      followCorePlatform(platform);
      document.documentElement.dataset.theme = theme;
      const withoutContrast = rings.map(paintedRatio);

      followDisplayModes({ contrast, transparency: undefined });

      rings.forEach((pair, index) => {
        expect(paintedRatio(pair), pair.join(" on ")).toBeGreaterThanOrEqual(
          withoutContrast[index] ?? Number.POSITIVE_INFINITY,
        );
      });
    });
  }
}

import { afterEach, expect, test } from "vitest";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

const PLATFORMS: readonly Platform[] = [
  "android",
  "ios",
  "linux",
  "macos",
  "windows",
];

const TODAYS_SLIDE = "0.35s";

afterEach(() => {
  document.body.replaceChildren();
});

for (const platform of PLATFORMS) {
  test(`slides at today's pace on ${platform}, from the token source`, () => {
    followCorePlatform(platform);
    const element = document.createElement("div");
    element.className = "duration-slide";
    document.body.append(element);

    const slide = getComputedStyle(element).transitionDuration;

    expect(slide).toBe(TODAYS_SLIDE);
  });
}

const TODAYS_FADE = "0.15s";

function fadeMotionDuration(platform: Platform): string {
  followCorePlatform(platform);
  const element = document.createElement("div");
  element.className = "fade-motion";
  document.body.append(element);
  return getComputedStyle(element).transitionDuration;
}

test("fades dialogs and tooltips over the fade duration on macOS, as its board draws", () => {
  expect(fadeMotionDuration("macos")).toBe(TODAYS_FADE);
});

for (const platform of PLATFORMS.filter((each) => each !== "macos")) {
  test(`keeps fading dialogs and tooltips at the slide pace on ${platform}`, () => {
    expect(fadeMotionDuration(platform)).toBe(TODAYS_SLIDE);
  });
}

const SHEET_MOTION: Record<
  Platform,
  { inDuration: string; outDuration: string; inEase: string; outEase: string }
> = {
  android: {
    inDuration: "0.4s",
    outDuration: "0.3s",
    inEase: "cubic-bezier(0.05, 0.7, 0.1, 1)",
    outEase: "cubic-bezier(0.3, 0, 0.8, 0.15)",
  },
  ios: sheetMotionLikeToday(),
  linux: sheetMotionLikeToday(),
  macos: sheetMotionLikeToday(),
  windows: sheetMotionLikeToday(),
};

function sheetMotionLikeToday() {
  return {
    inDuration: TODAYS_SLIDE,
    outDuration: TODAYS_SLIDE,
    inEase: "cubic-bezier(0.32, 0.72, 0, 1)",
    outEase: "cubic-bezier(0.32, 0.72, 0, 1)",
  };
}

for (const platform of PLATFORMS) {
  test(`times a sheet in and out on ${platform}, from the token source`, () => {
    followCorePlatform(platform);
    const opening = document.createElement("div");
    opening.className = "duration-sheet-in ease-sheet-in";
    const closing = document.createElement("div");
    closing.className = "duration-sheet-out ease-sheet-out";
    document.body.append(opening, closing);

    const drawn = {
      inDuration: getComputedStyle(opening).transitionDuration,
      outDuration: getComputedStyle(closing).transitionDuration,
      inEase: getComputedStyle(opening).transitionTimingFunction,
      outEase: getComputedStyle(closing).transitionTimingFunction,
    };

    expect(drawn).toEqual(SHEET_MOTION[platform]);
  });
}

const TOOLTIP_FADES: Record<Platform, string> = {
  android: TODAYS_FADE,
  ios: TODAYS_SLIDE,
  linux: TODAYS_SLIDE,
  macos: TODAYS_FADE,
  windows: "0.083s",
};

for (const platform of PLATFORMS) {
  test(`fades a tooltip over ${TOOLTIP_FADES[platform]} on ${platform}, from the token source`, () => {
    followCorePlatform(platform);
    const element = document.createElement("div");
    element.className = "fade-motion duration-tooltip ease-tooltip";
    document.body.append(element);

    const drawn = getComputedStyle(element);

    expect(drawn.transitionDuration).toBe(TOOLTIP_FADES[platform]);
    expect(drawn.transitionTimingFunction).toBe(
      platform === "windows" ? "linear" : "cubic-bezier(0.32, 0.72, 0, 1)",
    );
  });
}

for (const platform of PLATFORMS) {
  test(`slides a side pane over ${platform === "windows" ? "0.25s" : TODAYS_SLIDE} on ${platform}, from the token source`, () => {
    followCorePlatform(platform);
    const element = document.createElement("div");
    element.className = "duration-pane ease-pane";
    document.body.append(element);

    const drawn = getComputedStyle(element);

    expect(drawn.transitionDuration).toBe(
      platform === "windows" ? "0.25s" : TODAYS_SLIDE,
    );
    expect(drawn.transitionTimingFunction).toBe(
      platform === "windows"
        ? "cubic-bezier(0, 0, 0, 1)"
        : "cubic-bezier(0.32, 0.72, 0, 1)",
    );
  });
}

const FLYOUT_FADES: Record<Platform, string> = {
  android: "0.5s",
  ios: TODAYS_SLIDE,
  linux: TODAYS_SLIDE,
  macos: TODAYS_FADE,
  windows: "0.167s",
};

const FLYOUT_EASES: Record<Platform, string> = {
  android: "cubic-bezier(0.2, 0, 0, 1)",
  ios: "cubic-bezier(0.32, 0.72, 0, 1)",
  linux: "cubic-bezier(0.32, 0.72, 0, 1)",
  macos: "cubic-bezier(0.32, 0.72, 0, 1)",
  windows: "cubic-bezier(0, 0, 0, 1)",
};

for (const platform of PLATFORMS) {
  test(`fades a flyout over ${FLYOUT_FADES[platform]} on ${platform}, from the token source`, () => {
    followCorePlatform(platform);
    const element = document.createElement("div");
    element.className = "fade-motion duration-flyout ease-flyout";
    document.body.append(element);

    const drawn = getComputedStyle(element);

    expect(drawn.transitionDuration).toBe(FLYOUT_FADES[platform]);
    expect(drawn.transitionTimingFunction).toBe(FLYOUT_EASES[platform]);
  });
}

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

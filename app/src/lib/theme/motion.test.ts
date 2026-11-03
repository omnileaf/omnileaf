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

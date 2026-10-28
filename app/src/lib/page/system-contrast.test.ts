import { afterEach, expect, test } from "vitest";

import type { Platform, SystemContrast } from "#lib/ipc/bindings.ts";

import { followSystemContrast } from "./system-contrast";

type FollowChange = (contrast: SystemContrast) => void;

const root = document.documentElement;
const ELSEWHERE: readonly Platform[] = ["ios", "linux", "macos", "windows"];

afterEach(() => {
  delete root.dataset.contrast;
});

function reporting(...levels: readonly SystemContrast[]) {
  return (onChange: FollowChange): Promise<null> => {
    for (const level of levels) {
      onChange(level);
    }
    return Promise.resolve(null);
  };
}

test.each(["medium", "high"] as const)(
  "draws Android's %s contrast",
  (level) => {
    followSystemContrast("android", reporting(level));

    expect(root.dataset.contrast).toBe(level);
  },
);

test("draws the standard look once Android's contrast goes back to standard", () => {
  followSystemContrast("android", reporting("high", "standard"));

  expect(root.dataset.contrast).toBeUndefined();
});

test.each(ELSEWHERE)("leaves the contrast alone on %s", (platform) => {
  let isWatched = false;

  followSystemContrast(platform, () => {
    isWatched = true;
    return Promise.resolve(null);
  });

  expect(isWatched).toBe(false);
});

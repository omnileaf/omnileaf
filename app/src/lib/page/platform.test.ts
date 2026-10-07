import { expect, test } from "vitest";

import type { Platform } from "$lib/ipc/bindings";

import type { WidthClass } from "./breakpoints";
import { isPhone, usesCommandKey } from "./platform";

const TOUCH: readonly Platform[] = ["android", "ios"];
const DESKTOPS: readonly Platform[] = ["linux", "macos", "windows"];
const APPLE: readonly Platform[] = ["macos", "ios"];
const OTHERS: readonly Platform[] = ["linux", "windows", "android"];
const WIDTHS: readonly WidthClass[] = ["compact", "medium", "expanded"];

test.each(TOUCH)("counts a compact %s screen as a phone", (platform) => {
  expect(isPhone(platform, "compact")).toBe(true);
});

test.each(TOUCH)("counts a wider %s screen as a tablet", (platform) => {
  expect(isPhone(platform, "medium")).toBe(false);
  expect(isPhone(platform, "expanded")).toBe(false);
});

test.each(DESKTOPS)("never counts a %s window as a phone", (platform) => {
  for (const width of WIDTHS) {
    expect(isPhone(platform, width)).toBe(false);
  }
});

test.each(APPLE)("uses the Command key on %s", (platform) => {
  expect(usesCommandKey(platform)).toBe(true);
});

test.each(OTHERS)("uses the Ctrl key on %s", (platform) => {
  expect(usesCommandKey(platform)).toBe(false);
});

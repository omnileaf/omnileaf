import { expect, test } from "vitest";

import type { Platform } from "$lib/ipc/bindings";

import type { WidthClass } from "./breakpoints";
import { isPhone } from "./platform";

const TOUCH: readonly Platform[] = ["android", "ios"];
const DESKTOPS: readonly Platform[] = ["linux", "macos", "windows"];
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

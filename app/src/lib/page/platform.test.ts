import { expect, test, vi } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import type { WidthClass } from "./breakpoints";
import {
  currentPlatform,
  followCorePlatform,
  isPhone,
  usesCommandKey,
} from "./platform";

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

test("reads as linux until the core reports a platform", async () => {
  vi.resetModules();
  const fresh = await import("./platform");

  const platform = fresh.currentPlatform();

  expect(platform).toBe("linux");
});

test.each(TOUCH)("keeps %s once the core reports it", (platform) => {
  followCorePlatform(platform);

  expect(currentPlatform()).toBe(platform);
});

test.each(DESKTOPS)("marks the page as %s for the styles", (platform) => {
  followCorePlatform(platform);

  expect(document.documentElement.dataset.platform).toBe(platform);
});

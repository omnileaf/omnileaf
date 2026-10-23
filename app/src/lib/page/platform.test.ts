import { afterEach, expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import type { WidthClass } from "./breakpoints";
import {
  currentPlatform,
  followCorePlatform,
  hasNativeLook,
  isPhone,
  usesCommandKey,
} from "./platform";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

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

test("reads as linux until the core reports a platform", () => {
  delete document.documentElement.dataset.platform;

  const platform = currentPlatform();

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

test.each(TOUCH)("reads %s from the page, whoever marked it", (platform) => {
  document.documentElement.dataset.platform = platform;

  const read = currentPlatform();

  expect(read).toBe(platform);
});

test("reads as linux when the page is marked with a platform the app does not know", () => {
  document.documentElement.dataset.platform = "beos";

  const read = currentPlatform();

  expect(read).toBe("linux");
});

test.each(TOUCH)("draws %s's own look", (platform) => {
  expect(hasNativeLook(platform)).toBe(true);
});

test.each(DESKTOPS)(
  "keeps the shared look on %s until its turn",
  (platform) => {
    expect(hasNativeLook(platform)).toBe(false);
  },
);

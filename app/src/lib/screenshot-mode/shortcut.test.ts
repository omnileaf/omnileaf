import { describe, expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import {
  isScreenshotModeShortcut,
  type KeyPress,
  screenshotModeShortcutOn,
} from "./shortcut";

const CTRL_SHIFT_H: KeyPress = {
  key: "H",
  code: "KeyH",
  ctrlKey: true,
  shiftKey: true,
  altKey: false,
  metaKey: false,
  repeat: false,
};

const COMMAND_SHIFT_H: KeyPress = {
  ...CTRL_SHIFT_H,
  ctrlKey: false,
  metaKey: true,
};

const COMMAND_PLATFORMS: readonly Platform[] = ["macos", "ios"];

const CONTROL_PLATFORMS: readonly Platform[] = ["linux", "windows", "android"];

describe.each(COMMAND_PLATFORMS)("on %s", (platform) => {
  const shortcut = screenshotModeShortcutOn(platform);

  test("Command Shift H is the shortcut", () => {
    expect(isScreenshotModeShortcut(shortcut, COMMAND_SHIFT_H)).toBe(true);
  });

  test("Ctrl Shift H isn't the shortcut", () => {
    expect(isScreenshotModeShortcut(shortcut, CTRL_SHIFT_H)).toBe(false);
  });

  test("Command and Ctrl together aren't the shortcut", () => {
    expect(
      isScreenshotModeShortcut(shortcut, { ...COMMAND_SHIFT_H, ctrlKey: true }),
    ).toBe(false);
  });

  test("is shown the way Mac menus write it", () => {
    expect(shortcut.label()).toBe("⇧⌘H");
  });
});

describe.each(CONTROL_PLATFORMS)("on %s", (platform) => {
  const shortcut = screenshotModeShortcutOn(platform);

  test("Ctrl Shift H is the shortcut", () => {
    expect(isScreenshotModeShortcut(shortcut, CTRL_SHIFT_H)).toBe(true);
  });

  test("Command Shift H isn't the shortcut", () => {
    expect(isScreenshotModeShortcut(shortcut, COMMAND_SHIFT_H)).toBe(false);
  });

  test("is shown as Ctrl Shift H", () => {
    expect(shortcut.label()).toBe("Ctrl Shift H");
  });
});

describe("where the shortcut is Ctrl Shift H", () => {
  const shortcut = screenshotModeShortcutOn("linux");

  test("a lower-case h from Caps Lock is the shortcut too", () => {
    expect(
      isScreenshotModeShortcut(shortcut, { ...CTRL_SHIFT_H, key: "h" }),
    ).toBe(true);
  });

  test("the key where H sits is the shortcut on a layout without Latin letters", () => {
    expect(
      isScreenshotModeShortcut(shortcut, { ...CTRL_SHIFT_H, key: "Р" }),
    ).toBe(true);
  });

  test("an h elsewhere on a Latin layout is the shortcut", () => {
    expect(
      isScreenshotModeShortcut(shortcut, {
        ...CTRL_SHIFT_H,
        key: "h",
        code: "KeyJ",
      }),
    ).toBe(true);
  });

  test.each([
    ["without Shift", { shiftKey: false }],
    ["without Ctrl", { ctrlKey: false }],
    ["with Alt as well", { altKey: true }],
    ["with Meta as well", { metaKey: true }],
    ["with another letter", { key: "J" }],
    ["while the keys are held down", { repeat: true }],
  ])("isn't the shortcut %s", (_case, change: Partial<KeyPress>) => {
    expect(
      isScreenshotModeShortcut(shortcut, { ...CTRL_SHIFT_H, ...change }),
    ).toBe(false);
  });
});

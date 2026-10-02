import { expect, test } from "vitest";

import { isScreenshotModeShortcut, type KeyPress } from "./shortcut";

const CTRL_SHIFT_H: KeyPress = {
  key: "H",
  code: "KeyH",
  ctrlKey: true,
  shiftKey: true,
  altKey: false,
  metaKey: false,
  repeat: false,
};

test("Ctrl Shift H is the shortcut", () => {
  expect(isScreenshotModeShortcut(CTRL_SHIFT_H)).toBe(true);
});

test("a lower-case h from Caps Lock is the shortcut too", () => {
  expect(isScreenshotModeShortcut({ ...CTRL_SHIFT_H, key: "h" })).toBe(true);
});

test("the key where H sits is the shortcut on a layout without Latin letters", () => {
  expect(isScreenshotModeShortcut({ ...CTRL_SHIFT_H, key: "Р" })).toBe(true);
});

test("an h elsewhere on a Latin layout is the shortcut", () => {
  expect(
    isScreenshotModeShortcut({ ...CTRL_SHIFT_H, key: "h", code: "KeyJ" }),
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
  expect(isScreenshotModeShortcut({ ...CTRL_SHIFT_H, ...change })).toBe(false);
});

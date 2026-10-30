import { expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import {
  DEFAULT_SCREENSHOT_SHORTCUT,
  keyNames,
  parseKeyCombination,
  shownKeys,
} from "./key-combination";

const COMMAND_PLATFORMS: readonly Platform[] = ["macos", "ios"];
const CONTROL_PLATFORMS: readonly Platform[] = ["linux", "windows", "android"];

test.each(CONTROL_PLATFORMS)(
  "names Ctrl, Shift and the letter on %s",
  (platform) => {
    expect(keyNames(DEFAULT_SCREENSHOT_SHORTCUT, platform)).toEqual([
      "Ctrl",
      "Shift",
      "H",
    ]);
  },
);

test.each(COMMAND_PLATFORMS)("names ⌘ first on %s", (platform) => {
  expect(keyNames(DEFAULT_SCREENSHOT_SHORTCUT, platform)).toEqual([
    "⌘",
    "Shift",
    "H",
  ]);
});

test("leaves Shift out when it isn't held", () => {
  expect(keyNames({ letter: "J", shift: false }, "linux")).toEqual([
    "Ctrl",
    "J",
  ]);
});

test("shows a Windows shortcut as one Ctrl+Shift+H, as Windows writes accelerators", () => {
  expect(shownKeys(DEFAULT_SCREENSHOT_SHORTCUT, "windows")).toEqual([
    "Ctrl+Shift+H",
  ]);
});

test.each<Platform>(["linux", "macos"])(
  "shows each key of the shortcut on its own on %s",
  (platform) => {
    expect(shownKeys(DEFAULT_SCREENSHOT_SHORTCUT, platform)).toEqual(
      keyNames(DEFAULT_SCREENSHOT_SHORTCUT, platform),
    );
  },
);

test("reads a stored combination back", () => {
  const stored = JSON.stringify({ letter: "J", shift: false });

  expect(parseKeyCombination(stored)).toEqual({ letter: "J", shift: false });
});

test.each([
  null,
  "not json",
  JSON.stringify({ letter: "1", shift: true }),
  JSON.stringify({ letter: "jj", shift: true }),
  JSON.stringify({ letter: "J" }),
  JSON.stringify("J"),
])("falls back to the default from %s", (stored) => {
  expect(parseKeyCombination(stored)).toEqual(DEFAULT_SCREENSHOT_SHORTCUT);
});

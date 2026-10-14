import { expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import { screenshotModeShortcutLabel } from "./shortcut";

const COMMAND_PLATFORMS: readonly Platform[] = ["macos", "ios"];

const CONTROL_PLATFORMS: readonly Platform[] = ["linux", "windows", "android"];

test.each(COMMAND_PLATFORMS)(
  "is shown on %s the way Mac menus write it",
  (platform) => {
    expect(screenshotModeShortcutLabel(platform)).toBe("⇧⌘H");
  },
);

test.each(CONTROL_PLATFORMS)("is shown on %s as Ctrl Shift H", (platform) => {
  expect(screenshotModeShortcutLabel(platform)).toBe("Ctrl Shift H");
});

import { expect, test } from "vitest";

import { isPaneToggledBy, paneShortcutKeys } from "./pane-shortcut.ts";

test("names the pane shortcut for assistive technology with the platform's own modifier", () => {
  expect({
    windows: paneShortcutKeys("windows"),
    macos: paneShortcutKeys("macos"),
  }).toEqual({ windows: "Control+B", macos: "Meta+B" });
});

test("lets the shortcut fold Windows' pane only while the toggle is shown", () => {
  expect({
    open: isPaneToggledBy("windows", { isCompact: false }),
    compact: isPaneToggledBy("windows", { isCompact: true }),
  }).toEqual({ open: true, compact: false });
});

test("keeps the shortcut working while the pane is folded on other desktops", () => {
  expect(isPaneToggledBy("macos", { isCompact: true })).toBe(true);
});

import { expect, test } from "vitest";

import { iconActionsMenu } from "./icon-actions-menu";

const TURNS_OFF_AT = Date.UTC(2026, 9, 3, 22, 14);

test("names each shortcut in the app's words", () => {
  const menu = iconActionsMenu({ kind: "off" });

  expect([
    menu.screenshotMode,
    menu.continueReading,
    menu.searchLibrary,
  ]).toEqual(["Screenshot mode", "Continue reading", "Search the library"]);
});

test("offers to turn Screenshot mode on while it is off", () => {
  const menu = iconActionsMenu({ kind: "off" });

  expect([menu.screenshotModeState, menu.screenshotModeLabel]).toEqual([
    "Off",
    "Turn on Screenshot mode",
  ]);
});

test("offers to turn Screenshot mode off while it has an hour to run", () => {
  const menu = iconActionsMenu({ kind: "onUntil", turnsOffAt: TURNS_OFF_AT });

  expect([menu.screenshotModeState, menu.screenshotModeLabel]).toEqual([
    "On",
    "Turn off Screenshot mode",
  ]);
});

test("offers to turn Screenshot mode off while it has no hour limit", () => {
  const menu = iconActionsMenu({ kind: "on" });

  expect([menu.screenshotModeState, menu.screenshotModeLabel]).toEqual([
    "On",
    "Turn off Screenshot mode",
  ]);
});

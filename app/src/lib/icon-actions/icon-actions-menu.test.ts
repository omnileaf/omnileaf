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

test("says Screenshot mode is off, beside its name and on its own", () => {
  const menu = iconActionsMenu({ kind: "off" });

  expect([menu.screenshotModeState, menu.screenshotModeWithState]).toEqual([
    "Off",
    "Screenshot mode · Off",
  ]);
});

test("says only On while Screenshot mode has an hour to run", () => {
  const menu = iconActionsMenu({ kind: "onUntil", turnsOffAt: TURNS_OFF_AT });

  expect([menu.screenshotModeState, menu.screenshotModeWithState]).toEqual([
    "On",
    "Screenshot mode · On",
  ]);
});

test("says On while Screenshot mode has no hour limit", () => {
  const menu = iconActionsMenu({ kind: "on" });

  expect(menu.screenshotModeState).toBe("On");
});

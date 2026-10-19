import { expect, test } from "vitest";

import { DEFAULT_SCREENSHOT_SHORTCUT } from "#lib/screenshot-mode/key-combination.ts";

import { type TrayState, trayMenu } from "./tray-menu";

const TURNS_OFF_AT = Date.UTC(2026, 9, 3, 22, 14);

const OFF: TrayState = {
  activity: { kind: "off" },
  hourCycle: "h23",
  shortcut: DEFAULT_SCREENSHOT_SHORTCUT,
  hasBookToContinue: true,
};

test("names every item in the app's words", () => {
  const menu = trayMenu(OFF);

  expect([
    menu.open,
    menu.screenshotMode,
    menu.continueReading,
    menu.quit,
  ]).toEqual([
    "Open Omnileaf",
    "Screenshot mode",
    "Continue reading",
    "Quit Omnileaf",
  ]);
});

test("says Screenshot mode is off and leaves it unticked", () => {
  const menu = trayMenu(OFF);

  expect([menu.screenshotModeState, menu.isScreenshotModeOn]).toEqual([
    "Off",
    false,
  ]);
});

test("says when Screenshot mode turns off, in the chosen hour cycle", () => {
  const menu = trayMenu({
    ...OFF,
    activity: { kind: "onUntil", turnsOffAt: TURNS_OFF_AT },
  });

  expect([menu.screenshotModeState, menu.isScreenshotModeOn]).toEqual([
    "On · turns off at 22:14",
    true,
  ]);
});

test("says only On while Screenshot mode has no hour limit", () => {
  const menu = trayMenu({ ...OFF, activity: { kind: "on" } });

  expect(menu.screenshotModeState).toBe("On");
});

test("carries the chosen shortcut", () => {
  const menu = trayMenu({ ...OFF, shortcut: { letter: "J", shift: false } });

  expect(menu.screenshotModeShortcut).toEqual({ letter: "J", shift: false });
});

test("says whether there's a book to continue", () => {
  const menu = trayMenu({ ...OFF, hasBookToContinue: false });

  expect(menu.hasBookToContinue).toBe(false);
});

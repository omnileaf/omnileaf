import { expect, test } from "vitest";

import { DEFAULT_SCREENSHOT_SHORTCUT } from "./key-combination";
import { turnedOnNotice } from "./turned-on-notice";

const TURNS_OFF_AT = Date.UTC(2026, 9, 3, 22, 14);
const UNTIL = { kind: "onUntil", turnsOffAt: TURNS_OFF_AT } as const;

function wordsOf(notice: ReturnType<typeof turnedOnNotice>) {
  return {
    title: notice.title,
    body: notice.body,
    action: notice.action?.label,
  };
}

test("says it's on and when it turns off on a phone", () => {
  const notice = turnedOnNotice(
    UNTIL,
    "android",
    DEFAULT_SCREENSHOT_SHORTCUT,
    "h23", () => undefined);

  expect(wordsOf(notice)).toEqual({
    title: "Screenshot mode is on",
    body: "Turns off at 22:14",
    action: "Turn off",
  });
});

test("adds the shortcut that turns it off on a desktop", () => {
  const notice = turnedOnNotice(
    UNTIL,
    "windows",
    DEFAULT_SCREENSHOT_SHORTCUT,
    "h23", () => undefined);

  expect(notice.body).toBe("Turns off at 22:14 · Ctrl Shift H");
});

test("names the Mac's shortcut on a Mac", () => {
  const notice = turnedOnNotice(
    UNTIL,
    "macos",
    DEFAULT_SCREENSHOT_SHORTCUT,
    "h23", () => undefined);

  expect(notice.body).toBe("Turns off at 22:14 · ⌘ Shift H");
});

test("says nothing of turning off on a phone when it stays on", () => {
  const notice = turnedOnNotice(
    { kind: "on" },
    "ios",
    DEFAULT_SCREENSHOT_SHORTCUT,
    "h23", () => undefined);

  expect(notice.body).toBeUndefined();
});

test("gives only the shortcut on a desktop when it stays on", () => {
  const notice = turnedOnNotice(
    { kind: "on" },
    "linux",
    DEFAULT_SCREENSHOT_SHORTCUT,
    "h23",
    () => undefined,
  );

  expect(notice.body).toBe("Ctrl Shift H");
});

test("turns it off from its button", () => {
  let turnedOff = 0;
  const notice = turnedOnNotice(
    UNTIL,
    "android",
    DEFAULT_SCREENSHOT_SHORTCUT,
    "h23", () => {
    turnedOff += 1;
  });

  notice.action?.run();

  expect(turnedOff).toBe(1);
});

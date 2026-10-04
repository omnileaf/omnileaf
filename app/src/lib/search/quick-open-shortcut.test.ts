import { expect, test } from "vitest";

import { isQuickOpenShortcut } from "./quick-open-shortcut";

function press(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

test("opens quick open with Control K away from Apple's systems", () => {
  const pressed = [
    isQuickOpenShortcut(press({ key: "k", ctrlKey: true }), "linux"),
    isQuickOpenShortcut(press({ key: "K", ctrlKey: true }), "windows"),
    isQuickOpenShortcut(press({ key: "k", metaKey: true }), "linux"),
  ];

  expect(pressed).toEqual([true, true, false]);
});

test("opens quick open with Command K on Apple's systems", () => {
  const pressed = [
    isQuickOpenShortcut(press({ key: "k", metaKey: true }), "macos"),
    isQuickOpenShortcut(press({ key: "k", ctrlKey: true }), "macos"),
  ];

  expect(pressed).toEqual([true, false]);
});

test("leaves K with another modifier as well to whatever else wants it", () => {
  const pressed = [
    isQuickOpenShortcut(
      press({ key: "k", ctrlKey: true, shiftKey: true }),
      "linux",
    ),
    isQuickOpenShortcut(
      press({ key: "k", ctrlKey: true, altKey: true }),
      "linux",
    ),
    isQuickOpenShortcut(press({ key: "j", ctrlKey: true }), "linux"),
  ];

  expect(pressed).toEqual([false, false, false]);
});

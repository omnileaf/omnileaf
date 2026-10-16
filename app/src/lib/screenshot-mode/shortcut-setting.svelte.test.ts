import { afterEach, expect, test } from "vitest";

import { shortcut } from "#lib/shortcut.ts";

import { DEFAULT_SCREENSHOT_SHORTCUT } from "./key-combination";
import { ScreenshotModeShortcut } from "./shortcut-setting.svelte";

const detachments: (() => void)[] = [];

afterEach(() => {
  for (const detach of detachments.splice(0)) {
    detach();
  }
});

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function countPresses(setting: ScreenshotModeShortcut): () => number {
  let times = 0;
  detachments.push(
    shortcut(
      setting.shortcut("linux", () => {
        times += 1;
      }),
    )(window),
  );
  return () => times;
}

function press(init: KeyboardEventInit): void {
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
}

test("starts on Ctrl Shift H", () => {
  const setting = new ScreenshotModeShortcut(memoryStore());

  expect(setting.combination).toEqual(DEFAULT_SCREENSHOT_SHORTCUT);
});

test("keeps a chosen combination for the next launch", () => {
  const store = memoryStore();

  new ScreenshotModeShortcut(store).choose({ letter: "J", shift: false });

  expect(new ScreenshotModeShortcut(store).combination).toEqual({
    letter: "J",
    shift: false,
  });
});

test("answers to the chosen combination instead of the default", () => {
  const setting = new ScreenshotModeShortcut(memoryStore());
  setting.choose({ letter: "J", shift: false });
  const presses = countPresses(setting);

  press({ key: "j", ctrlKey: true });
  const afterChosen = presses();
  press({ key: "h", ctrlKey: true, shiftKey: true });

  expect([afterChosen, presses()]).toEqual([1, 1]);
});

test("answers in a text field too", () => {
  const setting = new ScreenshotModeShortcut(memoryStore());
  const presses = countPresses(setting);
  const field = document.createElement("input");
  document.body.append(field);

  field.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "H",
      ctrlKey: true,
      shiftKey: true,
    }),
  );
  field.remove();

  expect(presses()).toBe(1);
});

test("ignores a held key repeating", () => {
  const setting = new ScreenshotModeShortcut(memoryStore());
  const presses = countPresses(setting);

  press({ key: "H", ctrlKey: true, shiftKey: true });
  press({ key: "H", ctrlKey: true, shiftKey: true, repeat: true });

  expect(presses()).toBe(1);
});

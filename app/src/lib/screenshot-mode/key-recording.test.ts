import { describe, expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import { type PressedKeys, recordPress, takenUse } from "./key-recording";

function pressed(keys: Partial<PressedKeys>): PressedKeys {
  return {
    key: "",
    code: "",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...keys,
  };
}

describe("recording a press", () => {
  test("keeps Ctrl and a letter off Apple's platforms", () => {
    expect(
      recordPress(pressed({ key: "j", code: "KeyJ", ctrlKey: true }), "linux"),
    ).toEqual({
      kind: "combination",
      combination: { letter: "J", shift: false },
    });
  });

  test("keeps ⌘, Shift and a letter on a Mac", () => {
    expect(
      recordPress(
        pressed({ key: "J", code: "KeyJ", metaKey: true, shiftKey: true }),
        "macos",
      ),
    ).toEqual({
      kind: "combination",
      combination: { letter: "J", shift: true },
    });
  });

  test("reads the letter from where it sits on a layout without Latin letters", () => {
    expect(
      recordPress(
        pressed({ key: "р", code: "KeyH", ctrlKey: true }),
        "windows",
      ),
    ).toEqual({
      kind: "combination",
      combination: { letter: "H", shift: false },
    });
  });

  test.each<[string, Partial<PressedKeys>, Platform]>([
    ["a letter alone", { key: "j", code: "KeyJ" }, "linux"],
    ["Shift and a letter", { key: "J", code: "KeyJ", shiftKey: true }, "linux"],
    [
      "Alt with Ctrl",
      { key: "j", code: "KeyJ", ctrlKey: true, altKey: true },
      "windows",
    ],
    ["a number", { key: "5", code: "Digit5", ctrlKey: true }, "linux"],
    ["⌘ off a Mac", { key: "j", code: "KeyJ", metaKey: true }, "linux"],
    ["Ctrl on a Mac", { key: "j", code: "KeyJ", ctrlKey: true }, "macos"],
    [
      "Ctrl and ⌘ together",
      { key: "j", code: "KeyJ", ctrlKey: true, metaKey: true },
      "macos",
    ],
    ["Enter", { key: "Enter", code: "Enter" }, "linux"],
  ])("refuses %s", (_name, keys, platform) => {
    expect(recordPress(pressed(keys), platform)).toEqual({ kind: "unusable" });
  });

  test.each<[string, Partial<PressedKeys>]>([
    ["Tab", { key: "Tab", code: "Tab" }],
    ["Shift Tab", { key: "Tab", code: "Tab", shiftKey: true }],
    ["Esc", { key: "Escape", code: "Escape" }],
    ["Ctrl held alone", { key: "Control", code: "ControlLeft", ctrlKey: true }],
    ["Shift held alone", { key: "Shift", code: "ShiftLeft", shiftKey: true }],
  ])("passes %s on", (_name, keys) => {
    expect(recordPress(pressed(keys), "linux")).toEqual({ kind: "passedOn" });
  });
});

describe("a combination already in use", () => {
  test("Ctrl F searches the library", () => {
    expect(takenUse({ letter: "F", shift: false }, "linux")).toBe("search");
  });

  test("Ctrl Shift F is free", () => {
    expect(takenUse({ letter: "F", shift: true }, "linux")).toBeUndefined();
  });

  test.each<[string, boolean, string]>([
    ["K", false, "quickOpen"],
    ["Z", false, "undo"],
    ["Z", true, "editing"],
    ["A", true, "selectAll"],
    ["B", false, "sidebar"],
    ["C", false, "editing"],
    ["V", true, "editing"],
  ])("Ctrl %s, Shift %s, is the app's", (letter, shift, use) => {
    expect(takenUse({ letter, shift }, "windows")).toBe(use);
  });

  test("⌘ Q quits on a Mac but Ctrl Q is free elsewhere", () => {
    const quit = { letter: "Q", shift: false };

    expect([takenUse(quit, "macos"), takenUse(quit, "linux")]).toEqual([
      "macos",
      undefined,
    ]);
  });

  test("Ctrl Y redoes typing only on Windows", () => {
    const redo = { letter: "Y", shift: false };

    expect([takenUse(redo, "windows"), takenUse(redo, "linux")]).toEqual([
      "editing",
      undefined,
    ]);
  });
});

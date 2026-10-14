import { afterEach, expect, test } from "vitest";

import { shortcut } from "#lib/shortcut.ts";

import { type ReaderAction, readerShortcuts } from "./reader-keys";
import type { ReadingDirection } from "./reading-direction.svelte";

const detachments: (() => void)[] = [];

afterEach(() => {
  for (const detach of detachments.splice(0)) {
    detach();
  }
});

function actionsFor(
  presses: readonly KeyboardEventInit[],
  target: EventTarget = document.body,
  direction: ReadingDirection = "leftToRight",
): ReaderAction[] {
  const actions: ReaderAction[] = [];
  detachments.push(
    shortcut(
      ...readerShortcuts(
        (action) => {
          actions.push(action);
        },
        () => direction,
      ),
    )(window),
  );
  for (const init of presses) {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  }
  return actions;
}

test("turns to the next page with the right arrow, Page Down and Space", () => {
  const actions = actionsFor([
    { key: "ArrowRight" },
    { key: "PageDown" },
    { key: " ", code: "Space" },
  ]);

  expect(actions).toEqual(["next", "next", "next"]);
});

test("turns back with the left arrow, Page Up and Shift with Space", () => {
  const actions = actionsFor([
    { key: "ArrowLeft" },
    { key: "PageUp" },
    { key: " ", code: "Space", shiftKey: true },
  ]);

  expect(actions).toEqual(["previous", "previous", "previous"]);
});

test("turns on with the left arrow and back with the right in a book read right to left, leaving the other keys as they are", () => {
  const actions = actionsFor(
    [
      { key: "ArrowLeft" },
      { key: "ArrowRight" },
      { key: "PageDown" },
      { key: " ", code: "Space" },
    ],
    document.body,
    "rightToLeft",
  );

  expect(actions).toEqual(["next", "previous", "next", "next"]);
});

test("jumps to the first and last pages with Home and End", () => {
  const actions = actionsFor([{ key: "Home" }, { key: "End" }]);

  expect(actions).toEqual(["first", "last"]);
});

test("shows or hides the controls with M, wherever the layout puts it", () => {
  const actions = actionsFor([
    { key: "m", code: "KeyM" },
    { key: "M", code: "KeyM", shiftKey: true },
    { key: "ь", code: "KeyM" },
  ]);

  expect(actions).toEqual([
    "toggleControls",
    "toggleControls",
    "toggleControls",
  ]);
});

test("goes in or out of full screen with F, wherever the layout puts it", () => {
  const actions = actionsFor([
    { key: "f", code: "KeyF" },
    { key: "F", code: "KeyF", shiftKey: true },
    { key: "а", code: "KeyF" },
  ]);

  expect(actions).toEqual(["fullScreen", "fullScreen", "fullScreen"]);
});

test("leaves full screen, or else the book, with Escape", () => {
  const actions = actionsFor([{ key: "Escape" }]);

  expect(actions).toEqual(["leave"]);
});

test("leaves shortcuts held with another modifier and keys it has no use for alone", () => {
  const actions = actionsFor([
    { key: "ArrowRight", ctrlKey: true },
    { key: "ArrowLeft", altKey: true },
    { key: "m", code: "KeyM", metaKey: true },
    { key: "f", code: "KeyF", ctrlKey: true },
    { key: "ArrowRight", shiftKey: true },
    { key: "ArrowDown" },
    { key: "Tab" },
    { key: "Enter" },
  ]);

  expect(actions).toEqual([]);
});

test("takes its keys on a focused slider unless the slider moves on them", () => {
  const slider = document.createElement("input");
  slider.type = "range";
  document.body.append(slider);

  const actions = actionsFor(
    ["ArrowRight", "Home", " ", "f", "Escape"].map((key) => ({ key })),
    slider,
  );

  expect(actions).toEqual(["next", "fullScreen", "leave"]);
  slider.remove();
});

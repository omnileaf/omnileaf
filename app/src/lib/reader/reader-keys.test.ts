import { expect, test } from "vitest";

import { readerActionFor } from "./reader-keys";

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, ...init });
}

test("turns to the next page with the right arrow, Page Down and Space", () => {
  const actions = [
    press("ArrowRight"),
    press("PageDown"),
    press(" ", { code: "Space" }),
  ].map(readerActionFor);

  expect(actions).toEqual(["next", "next", "next"]);
});

test("turns back with the left arrow, Page Up and Shift with Space", () => {
  const actions = [
    press("ArrowLeft"),
    press("PageUp"),
    press(" ", { code: "Space", shiftKey: true }),
  ].map(readerActionFor);

  expect(actions).toEqual(["previous", "previous", "previous"]);
});

test("jumps to the first and last pages with Home and End", () => {
  const actions = [press("Home"), press("End")].map(readerActionFor);

  expect(actions).toEqual(["first", "last"]);
});

test("shows or hides the controls with M, wherever the layout puts it", () => {
  const actions = [
    press("m", { code: "KeyM" }),
    press("M", { code: "KeyM", shiftKey: true }),
    press("ь", { code: "KeyM" }),
  ].map(readerActionFor);

  expect(actions).toEqual([
    "toggleControls",
    "toggleControls",
    "toggleControls",
  ]);
});

test("closes the book with Escape", () => {
  const action = readerActionFor(press("Escape"));

  expect(action).toBe("close");
});

test("leaves shortcuts held with another modifier and keys it has no use for alone", () => {
  const actions = [
    press("ArrowRight", { ctrlKey: true }),
    press("ArrowLeft", { altKey: true }),
    press("m", { code: "KeyM", metaKey: true }),
    press("ArrowDown"),
    press("Tab"),
    press("Enter"),
  ].map(readerActionFor);

  expect(actions).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
});

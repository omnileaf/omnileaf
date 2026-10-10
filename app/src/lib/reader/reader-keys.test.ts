import { expect, test } from "vitest";

import { isKeyForFocusedControl, readerActionFor } from "./reader-keys";

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

test("goes in or out of full screen with F, wherever the layout puts it", () => {
  const actions = [
    press("f", { code: "KeyF" }),
    press("F", { code: "KeyF", shiftKey: true }),
    press("а", { code: "KeyF" }),
  ].map(readerActionFor);

  expect(actions).toEqual(["fullScreen", "fullScreen", "fullScreen"]);
});

test("leaves full screen, or else the book, with Escape", () => {
  const action = readerActionFor(press("Escape"));

  expect(action).toBe("leave");
});

test("leaves shortcuts held with another modifier and keys it has no use for alone", () => {
  const actions = [
    press("ArrowRight", { ctrlKey: true }),
    press("ArrowLeft", { altKey: true }),
    press("m", { code: "KeyM", metaKey: true }),
    press("f", { code: "KeyF", ctrlKey: true }),
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
    undefined,
  ]);
});

function pressOn(target: HTMLElement, key: string): KeyboardEvent {
  const event = press(key);
  Object.defineProperty(event, "target", { value: target });
  return event;
}

function slider(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "range";
  return input;
}

test("leaves the arrows and paging keys to a focused slider", () => {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"];

  const taken = keys.map((key) =>
    isKeyForFocusedControl(pressOn(slider(), key)),
  );

  expect(taken).toEqual([true, true, true, true, true, true]);
});

test("leaves Space and Enter to a focused button or link", () => {
  const button = document.createElement("button");
  const link = document.createElement("a");

  const taken = [
    isKeyForFocusedControl(pressOn(button, " ")),
    isKeyForFocusedControl(pressOn(button, "Enter")),
    isKeyForFocusedControl(pressOn(link, "Enter")),
  ];

  expect(taken).toEqual([true, true, true]);
});

test("takes the keys no focused control acts on", () => {
  const button = document.createElement("button");

  const taken = [
    isKeyForFocusedControl(pressOn(button, "ArrowRight")),
    isKeyForFocusedControl(pressOn(slider(), "Escape")),
    isKeyForFocusedControl(pressOn(document.body, " ")),
  ];

  expect(taken).toEqual([false, false, false]);
});

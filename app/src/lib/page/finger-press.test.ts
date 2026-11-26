import { afterEach, expect, test } from "vitest";

import { markFingerPresses } from "./finger-press";

function buttonWithLabel(): { button: HTMLButtonElement; label: HTMLElement } {
  const button = document.createElement("button");
  const label = document.createElement("span");
  button.append(label);
  document.body.append(button);
  return { button, label };
}

function pointer(
  type: string,
  pointerType: "touch" | "mouse" = "touch",
): PointerEvent {
  return new PointerEvent(type, { bubbles: true, pointerType });
}

afterEach(() => {
  document.body.replaceChildren();
});

test("marks the button under a finger as pressed while the finger is down", () => {
  const stop = markFingerPresses(document);
  const { button, label } = buttonWithLabel();

  label.dispatchEvent(pointer("pointerdown"));

  expect(button.hasAttribute("data-pressed")).toBe(true);
  stop();
});

test("clears the mark when the finger lifts", () => {
  const stop = markFingerPresses(document);
  const { button, label } = buttonWithLabel();
  label.dispatchEvent(pointer("pointerdown"));

  label.dispatchEvent(pointer("pointerup"));

  expect(button.hasAttribute("data-pressed")).toBe(false);
  stop();
});

test("clears the mark when the touch turns into a scroll", () => {
  const stop = markFingerPresses(document);
  const { button, label } = buttonWithLabel();
  label.dispatchEvent(pointer("pointerdown"));

  label.dispatchEvent(pointer("pointercancel"));

  expect(button.hasAttribute("data-pressed")).toBe(false);
  stop();
});

test("clears the mark when the finger lifts somewhere else", () => {
  const stop = markFingerPresses(document);
  const { button, label } = buttonWithLabel();
  label.dispatchEvent(pointer("pointerdown"));

  document.body.dispatchEvent(pointer("pointerup"));

  expect(button.hasAttribute("data-pressed")).toBe(false);
  stop();
});

test("leaves a mouse press to the browser", () => {
  const stop = markFingerPresses(document);
  const { button, label } = buttonWithLabel();

  label.dispatchEvent(pointer("pointerdown", "mouse"));

  expect(button.hasAttribute("data-pressed")).toBe(false);
  stop();
});

test("leaves a disabled button unmarked", () => {
  const stop = markFingerPresses(document);
  const { button, label } = buttonWithLabel();
  button.disabled = true;

  label.dispatchEvent(pointer("pointerdown"));

  expect(button.hasAttribute("data-pressed")).toBe(false);
  stop();
});

test("stops marking once told to", () => {
  const stop = markFingerPresses(document);
  stop();
  const { button, label } = buttonWithLabel();

  label.dispatchEvent(pointer("pointerdown"));

  expect(button.hasAttribute("data-pressed")).toBe(false);
});

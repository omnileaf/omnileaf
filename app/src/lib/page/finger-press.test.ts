import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  FINGER_PRESS_DELAY_MS,
  markFingerPresses,
  SHORTEST_PRESS_SHOWN_MS,
} from "./finger-press.ts";

interface Finger {
  readonly pointerId: number;
  readonly pointerType?: "touch" | "mouse";
  readonly clientX?: number;
  readonly clientY?: number;
}

const FIRST: Finger = { pointerId: 1 };
const SECOND: Finger = { pointerId: 2 };
const SLOP_AND_MORE = 24;

function button(): { button: HTMLButtonElement; label: HTMLElement } {
  const pressable = document.createElement("button");
  const label = document.createElement("span");
  pressable.append(label);
  document.body.append(pressable);
  return { button: pressable, label };
}

function send(target: Element, type: string, finger: Finger = FIRST): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerType: "touch",
      clientX: 0,
      clientY: 0,
      ...finger,
    }),
  );
}

let stop: () => void = () => undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  stop = markFingerPresses(document);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  document.body.replaceChildren();
});

test("marks the button under a resting finger as pressed once the finger has stayed put", () => {
  const { button: held, label } = button();

  send(label, "pointerdown");
  const before = held.hasAttribute("data-pressed");
  vi.advanceTimersByTime(FINGER_PRESS_DELAY_MS);

  expect(before).toBe(false);
  expect(held.hasAttribute("data-pressed")).toBe(true);
});

test("never marks a button when the touch turns into a scroll before the delay", () => {
  const { button: flicked, label } = button();
  send(label, "pointerdown");

  send(label, "pointercancel");
  vi.advanceTimersByTime(FINGER_PRESS_DELAY_MS);

  expect(flicked.hasAttribute("data-pressed")).toBe(false);
});

test("never marks a button when the finger slides away before the delay", () => {
  const { button: flicked, label } = button();
  send(label, "pointerdown");

  send(label, "pointermove", { ...FIRST, clientY: SLOP_AND_MORE });
  vi.advanceTimersByTime(FINGER_PRESS_DELAY_MS);

  expect(flicked.hasAttribute("data-pressed")).toBe(false);
});

test("shows a quick tap's press at once and keeps it long enough to be seen", () => {
  const { button: tapped, label } = button();
  send(label, "pointerdown");

  send(label, "pointerup");
  const shown = tapped.hasAttribute("data-pressed");
  vi.advanceTimersByTime(SHORTEST_PRESS_SHOWN_MS - 1);
  const stillShown = tapped.hasAttribute("data-pressed");
  vi.advanceTimersByTime(1);

  expect([shown, stillShown]).toEqual([true, true]);
  expect(tapped.hasAttribute("data-pressed")).toBe(false);
});

test("clears a held press as soon as the finger lifts", () => {
  const { button: held, label } = button();
  send(label, "pointerdown");
  vi.advanceTimersByTime(FINGER_PRESS_DELAY_MS);

  send(label, "pointerup");

  expect(held.hasAttribute("data-pressed")).toBe(false);
});

test("clears a held press when the touch turns into a scroll", () => {
  const { button: held, label } = button();
  send(label, "pointerdown");
  vi.advanceTimersByTime(FINGER_PRESS_DELAY_MS);

  send(label, "pointercancel");

  expect(held.hasAttribute("data-pressed")).toBe(false);
});

test("keeps one finger's press when a second finger lifts", () => {
  const first = button();
  const second = button();
  send(first.label, "pointerdown", FIRST);
  send(second.label, "pointerdown", SECOND);
  vi.advanceTimersByTime(FINGER_PRESS_DELAY_MS);

  send(second.label, "pointerup", SECOND);

  expect(first.button.hasAttribute("data-pressed")).toBe(true);
  expect(second.button.hasAttribute("data-pressed")).toBe(false);
});

test("leaves a mouse press to the browser", () => {
  const { button: clicked, label } = button();

  send(label, "pointerdown", { ...FIRST, pointerType: "mouse" });
  vi.advanceTimersByTime(FINGER_PRESS_DELAY_MS);

  expect(clicked.hasAttribute("data-pressed")).toBe(false);
});

test("leaves a disabled or busy button unmarked", () => {
  const disabled = button();
  const busy = button();
  disabled.button.disabled = true;
  busy.button.setAttribute("aria-disabled", "true");

  send(disabled.label, "pointerdown", FIRST);
  send(busy.label, "pointerdown", SECOND);
  vi.advanceTimersByTime(FINGER_PRESS_DELAY_MS);

  expect(disabled.button.hasAttribute("data-pressed")).toBe(false);
  expect(busy.button.hasAttribute("data-pressed")).toBe(false);
});

test("stops marking once told to", () => {
  stop();
  const { button: ignored, label } = button();

  send(label, "pointerdown");
  vi.advanceTimersByTime(FINGER_PRESS_DELAY_MS);

  expect(ignored.hasAttribute("data-pressed")).toBe(false);
});

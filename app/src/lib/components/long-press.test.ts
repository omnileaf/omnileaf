import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { LongPress } from "./long-press.ts";

const HELD_MS = 500;

function press(pointerType: string): PointerEvent {
  return new PointerEvent("pointerdown", { pointerType });
}

function click(): MouseEvent {
  return new MouseEvent("click", { cancelable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("calls back once a finger has been held for the hold time", () => {
  const longPress = new LongPress(HELD_MS);
  const onHeld = vi.fn();
  longPress.pressed(press("touch"), onHeld);

  vi.advanceTimersByTime(HELD_MS);

  expect(onHeld).toHaveBeenCalledOnce();
});

test("doesn't call back for a finger lifted before the hold time", () => {
  const longPress = new LongPress(HELD_MS);
  const onHeld = vi.fn();
  longPress.pressed(press("touch"), onHeld);

  vi.advanceTimersByTime(HELD_MS - 1);
  longPress.released();
  vi.advanceTimersByTime(HELD_MS);

  expect(onHeld).not.toHaveBeenCalled();
});

test("doesn't call back for a mouse button held down", () => {
  const longPress = new LongPress(HELD_MS);
  const onHeld = vi.fn();
  longPress.pressed(press("mouse"), onHeld);

  vi.advanceTimersByTime(HELD_MS);

  expect(onHeld).not.toHaveBeenCalled();
});

test("swallows the click a long press ends with", () => {
  const longPress = new LongPress(HELD_MS);
  longPress.pressed(press("touch"), () => undefined);
  vi.advanceTimersByTime(HELD_MS);
  const ending = click();

  longPress.clicked(ending);

  expect(ending.defaultPrevented).toBe(true);
});

test("lets through the click after a tap", () => {
  const longPress = new LongPress(HELD_MS);
  longPress.pressed(press("touch"), () => undefined);
  longPress.released();
  const tap = click();

  longPress.clicked(tap);

  expect(tap.defaultPrevented).toBe(false);
});

test("lets through the next press's click when a long press ended without one", () => {
  const longPress = new LongPress(HELD_MS);
  longPress.pressed(press("touch"), () => undefined);
  vi.advanceTimersByTime(HELD_MS);
  longPress.pointerWentDown();
  const nextTap = click();

  longPress.clicked(nextTap);

  expect(nextTap.defaultPrevented).toBe(false);
});

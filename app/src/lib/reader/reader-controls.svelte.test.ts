import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ReaderControls } from "./reader-controls.svelte";

const HIDE_AFTER_MS = 3000;

const frames: FrameRequestCallback[] = [];

function drawFrame(): void {
  for (const callback of frames.splice(0)) {
    callback(performance.now());
  }
}

function drawFramesAtOnce(): void {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(performance.now());
    return 0;
  });
}

function holdFrames(): void {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    frames.push(callback),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  drawFramesAtOnce();
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  frames.length = 0;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("counts the delay from the frame the controls are first drawn in, however late it comes", () => {
  holdFrames();
  const controls = new ReaderControls(HIDE_AFTER_MS);

  vi.advanceTimersByTime(HIDE_AFTER_MS * 2);
  const isShownBeforeDrawn = controls.isShown;
  drawFrame();
  vi.advanceTimersByTime(HIDE_AFTER_MS);

  expect([isShownBeforeDrawn, controls.isShown]).toEqual([true, false]);
});

test("shows the controls as the book opens and hides them once the delay passes", () => {
  const controls = new ReaderControls(HIDE_AFTER_MS);

  vi.advanceTimersByTime(HIDE_AFTER_MS - 1);
  const isShownBefore = controls.isShown;
  vi.advanceTimersByTime(1);

  expect([isShownBefore, controls.isShown]).toEqual([true, false]);
});

test("hides the controls at once when asked, before the delay passes", () => {
  const controls = new ReaderControls(HIDE_AFTER_MS);

  controls.hide();

  expect(controls.isShown).toBe(false);
});

test("shows hidden controls again and hides them after the same delay", () => {
  const controls = new ReaderControls(HIDE_AFTER_MS);
  controls.hide();

  controls.toggle();
  const isShownAgain = controls.isShown;
  vi.advanceTimersByTime(HIDE_AFTER_MS);

  expect([isShownAgain, controls.isShown]).toEqual([true, false]);
});

test("restarts the delay each time the controls are shown", () => {
  const controls = new ReaderControls(HIDE_AFTER_MS);
  vi.advanceTimersByTime(HIDE_AFTER_MS - 1);

  controls.show();
  vi.advanceTimersByTime(HIDE_AFTER_MS - 1);

  expect(controls.isShown).toBe(true);
});

test("keeps the controls while the pointer rests on them, then hides them the delay after it leaves", () => {
  const controls = new ReaderControls(HIDE_AFTER_MS);
  controls.pointerEntered();

  vi.advanceTimersByTime(HIDE_AFTER_MS * 2);
  const isShownWhileOver = controls.isShown;
  controls.pointerLeft();
  vi.advanceTimersByTime(HIDE_AFTER_MS);

  expect([isShownWhileOver, controls.isShown]).toEqual([true, false]);
});

test("keeps the controls while a control has keyboard focus, then hides them the delay after it goes", () => {
  const controls = new ReaderControls(HIDE_AFTER_MS);
  controls.hide();
  controls.focused();

  vi.advanceTimersByTime(HIDE_AFTER_MS * 2);
  const isShownWhileFocused = controls.isShown;
  controls.blurred();
  vi.advanceTimersByTime(HIDE_AFTER_MS);

  expect([isShownWhileFocused, controls.isShown]).toEqual([true, false]);
});

test("forgets a pointer resting on controls hidden from under it, so they go again once shown", () => {
  const controls = new ReaderControls(HIDE_AFTER_MS);
  controls.pointerEntered();
  controls.hide();

  controls.show();
  vi.advanceTimersByTime(HIDE_AFTER_MS);

  expect(controls.isShown).toBe(false);
});

test("hides nothing once stopped, as when the reader closes", () => {
  const controls = new ReaderControls(HIDE_AFTER_MS);

  controls.stop();
  vi.advanceTimersByTime(HIDE_AFTER_MS);

  expect(controls.isShown).toBe(true);
});

test("keeps the controls while a menu opened from them is up, though focus moves into it, then hides them the delay after it closes", () => {
  const controls = new ReaderControls(HIDE_AFTER_MS);
  controls.hold();
  controls.blurred();

  vi.advanceTimersByTime(HIDE_AFTER_MS * 2);
  const isShownWhileHeld = controls.isShown;
  controls.release();
  vi.advanceTimersByTime(HIDE_AFTER_MS);

  expect([isShownWhileHeld, controls.isShown]).toEqual([true, false]);
});

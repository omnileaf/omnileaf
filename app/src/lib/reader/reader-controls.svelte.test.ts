import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ReaderControls } from "./reader-controls.svelte";

const HIDE_AFTER_MS = 3000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
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

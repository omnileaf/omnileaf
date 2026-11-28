import { expect, test } from "vitest";

import { DoubleTapWindow } from "./double-tap-window";

const WINDOW_MS = 310;
const SLOP_PX = 100;
const LIFT = { at: 1000, x: 200, y: 400 };

test("takes a press near the last lift, within the window, as a second tap", () => {
  const window = new DoubleTapWindow(WINDOW_MS, SLOP_PX);
  window.lifted(LIFT);

  const quick = window.isSecondTap({ ...LIFT, at: LIFT.at + 45 });
  const late = window.isSecondTap({ ...LIFT, at: LIFT.at + 305 });

  expect([quick, late]).toEqual([true, true]);
});

test("takes a press after the window, or far from the lift, as a first tap", () => {
  const window = new DoubleTapWindow(WINDOW_MS, SLOP_PX);
  window.lifted(LIFT);

  const afterTheWindow = window.isSecondTap({ ...LIFT, at: LIFT.at + 385 });
  const farAway = window.isSecondTap({ ...LIFT, at: LIFT.at + 45, x: 360 });

  expect([afterTheWindow, farAway]).toEqual([false, false]);
});

test("takes the first press of all as a first tap", () => {
  const window = new DoubleTapWindow(WINDOW_MS, SLOP_PX);

  expect(window.isSecondTap(LIFT)).toBe(false);
});

test("counts what is left of the window from the lift", () => {
  const window = new DoubleTapWindow(WINDOW_MS, SLOP_PX);
  window.lifted(LIFT);

  const left = [
    window.leftAfter(LIFT.at + 5),
    window.leftAfter(LIFT.at + WINDOW_MS + 20),
  ];

  expect(left).toEqual([WINDOW_MS - 5, 0]);
});

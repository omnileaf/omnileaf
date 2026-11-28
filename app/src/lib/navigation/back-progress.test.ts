import { expect, test } from "vitest";

import { easedBackProgress } from "./back-progress";

test("starts at nothing and ends at all of it", () => {
  expect(easedBackProgress(0)).toBe(0);
  expect(easedBackProgress(1)).toBeCloseTo(1);
});

test("runs ahead of the finger early in the gesture, as Android's back curve does", () => {
  expect(easedBackProgress(0.5)).toBeGreaterThan(0.8);
  expect(easedBackProgress(0.5)).toBeLessThan(1);
});

test("keeps to the gesture's range however far the system reports it", () => {
  expect(easedBackProgress(1.4)).toBe(easedBackProgress(1));
  expect(easedBackProgress(-0.2)).toBe(easedBackProgress(0));
});

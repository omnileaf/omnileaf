import { expect, test } from "vitest";

import { cubicBezier, cubicPath } from "./cubic-bezier";

const SECOND_SEGMENT_MIDDLE = { x: 0.317708, y: 0.8575 };

function emphasized(): (x: number) => number {
  return cubicPath([
    {
      control1: { x: 0.05, y: 0 },
      control2: { x: 0.133333, y: 0.06 },
      to: { x: 0.166666, y: 0.4 },
    },
    {
      control1: { x: 0.208333, y: 0.82 },
      control2: { x: 0.25, y: 1 },
      to: { x: 1, y: 1 },
    },
  ]);
}

test("passes through the joint between a path's segments", () => {
  expect(emphasized()(0.166666)).toBeCloseTo(0.4, 4);
});

test("follows the second segment past the joint", () => {
  const curve = emphasized();

  expect(curve(SECOND_SEGMENT_MIDDLE.x)).toBeCloseTo(
    SECOND_SEGMENT_MIDDLE.y,
    4,
  );
});

test("starts at rest and ends in place", () => {
  const curve = emphasized();

  expect([curve(0), curve(1)]).toEqual([0, 1]);
});

test("draws a single curve as a one-segment path", () => {
  const curve = cubicBezier(0.1, 0.1, 0, 1);
  const path = cubicPath([
    {
      control1: { x: 0.1, y: 0.1 },
      control2: { x: 0, y: 1 },
      to: { x: 1, y: 1 },
    },
  ]);

  expect(curve(0.3)).toBeCloseTo(path(0.3), 6);
});

import { expect, test } from "vitest";

import { backSwipeEdge, isGoingBack, placeScreens } from "./back-swipe";

test("goes back from the left edge of a nested screen", () => {
  expect(backSwipeEdge(true, "ltr")).toBe("left");
});

test("goes back from the right edge in right-to-left languages", () => {
  expect(backSwipeEdge(true, "rtl")).toBe("right");
});

test("ignores the swipe on a top-level section, which has nothing to go back to", () => {
  expect(backSwipeEdge(false, "ltr")).toBeNull();
  expect(backSwipeEdge(false, "rtl")).toBeNull();
});

test("starts with the previous screen 30% behind and dimmed", () => {
  expect(placeScreens(0, false)).toEqual({
    current: 0,
    previous: -0.3,
    dimming: 0.12,
  });
});

test("moves the current screen one to one and brings the previous one in", () => {
  const placement = placeScreens(0.5, false);

  expect(placement.current).toBe(0.5);
  expect(placement.previous).toBeCloseTo(-0.15);
  expect(placement.dimming).toBeCloseTo(0.06);
});

test("has the previous screen in place and undimmed once the swipe arrives", () => {
  expect(placeScreens(1, false)).toEqual({
    current: 1,
    previous: 0,
    dimming: 0,
  });
});

test("keeps the screens within the swipe however far the finger goes", () => {
  expect(placeScreens(-0.2, false)).toEqual(placeScreens(0, false));
  expect(placeScreens(1.4, false)).toEqual(placeScreens(1, false));
});

test("leaves the previous screen in place when motion is reduced", () => {
  const placement = placeScreens(0.4, true);

  expect(placement.current).toBe(0.4);
  expect(placement.previous).toBe(0);
});

test("goes back when let go past halfway", () => {
  expect(isGoingBack(0.6, 0)).toBe(true);
});

test("springs back when let go before halfway", () => {
  expect(isGoingBack(0.4, 0)).toBe(false);
});

test("goes back on a flick, however short", () => {
  expect(isGoingBack(0.1, 2)).toBe(true);
});

test("springs back on a flick towards the edge, even past halfway", () => {
  expect(isGoingBack(0.7, -2)).toBe(false);
});

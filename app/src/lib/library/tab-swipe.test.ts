import { expect, test } from "vitest";

import { isAcross, tabSwipedTo } from "./tab-swipe";

const WIDTH = 400;

test("moves to the next tab on a swipe towards the start past a quarter of the width", () => {
  expect(
    tabSwipedTo({ moved: -120, width: WIDTH, velocity: 0, direction: "ltr" }),
  ).toBe(1);
});

test("moves to the tab before on a swipe towards the end", () => {
  expect(
    tabSwipedTo({ moved: 120, width: WIDTH, velocity: 0, direction: "ltr" }),
  ).toBe(-1);
});

test("turns the other way in a right-to-left layout", () => {
  expect(
    tabSwipedTo({ moved: -120, width: WIDTH, velocity: 0, direction: "rtl" }),
  ).toBe(-1);
});

test("stays on a short drag, unless it is a flick", () => {
  expect(
    tabSwipedTo({ moved: -40, width: WIDTH, velocity: 0, direction: "ltr" }),
  ).toBe(0);
  expect(
    tabSwipedTo({ moved: -40, width: WIDTH, velocity: -1, direction: "ltr" }),
  ).toBe(1);
});

test("takes a drag as a swipe across only once it runs mostly sideways", () => {
  expect(isAcross({ x: 12, y: 3 })).toBe(true);
  expect(isAcross({ x: 12, y: 10 })).toBe(false);
  expect(isAcross({ x: 4, y: 0 })).toBe(false);
});

import { expect, test } from "vitest";

import {
  isSidewaysDrag,
  type SwipeSide,
  swipeOutcome,
  travelToward,
} from "./swipe";

const ROW = 360;
const EITHER_SIDE = (): boolean => true;

test("springs back from a nudge", () => {
  expect(swipeOutcome({ travel: 20, rowWidth: ROW }, EITHER_SIDE)).toEqual({
    kind: "rest",
  });
});

test("reveals the action of a short swipe toward the end", () => {
  expect(swipeOutcome({ travel: 90, rowWidth: ROW }, EITHER_SIDE)).toEqual({
    kind: "reveal",
    side: "towardEnd",
  });
});

test("reveals the action of a short swipe toward the start", () => {
  expect(swipeOutcome({ travel: -90, rowWidth: ROW }, EITHER_SIDE)).toEqual({
    kind: "reveal",
    side: "towardStart",
  });
});

test("acts at once on a swipe past half the row", () => {
  expect(swipeOutcome({ travel: 200, rowWidth: ROW }, EITHER_SIDE)).toEqual({
    kind: "act",
    side: "towardEnd",
  });
});

test("springs back from a swipe toward a side with nothing to do", () => {
  const onlyTowardEnd = (side: SwipeSide): boolean => side === "towardEnd";

  expect(swipeOutcome({ travel: -250, rowWidth: ROW }, onlyTowardEnd)).toEqual({
    kind: "rest",
  });
});

test("takes a drag as a swipe only once it moves more across than down", () => {
  expect([
    isSidewaysDrag(14, 3),
    isSidewaysDrag(14, 20),
    isSidewaysDrag(4, 0),
  ]).toEqual([true, false, false]);
});

test("mirrors the travel of a swipe in right-to-left text", () => {
  expect([travelToward(80, "ltr"), travelToward(80, "rtl")]).toEqual([80, -80]);
});

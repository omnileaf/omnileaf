import { expect, test } from "vitest";

import {
  isSidewaysDrag,
  type SwipeSide,
  swipeOutcome,
  travelToward,
} from "./swipe";

const ROW = { rowWidth: 360, openPx: 0, actPastOpenPx: 0 };
const EITHER_SIDE = (): boolean => true;

test("springs back from a nudge", () => {
  expect(swipeOutcome({ travel: 20, ...ROW }, EITHER_SIDE)).toEqual({
    kind: "rest",
  });
});

test("reveals the action of a short swipe toward the end", () => {
  expect(swipeOutcome({ travel: 90, ...ROW }, EITHER_SIDE)).toEqual({
    kind: "reveal",
    side: "towardEnd",
  });
});

test("reveals the action of a short swipe toward the start", () => {
  expect(swipeOutcome({ travel: -90, ...ROW }, EITHER_SIDE)).toEqual({
    kind: "reveal",
    side: "towardStart",
  });
});

test("acts at once on a swipe past half the row", () => {
  expect(swipeOutcome({ travel: 200, ...ROW }, EITHER_SIDE)).toEqual({
    kind: "act",
    side: "towardEnd",
  });
});

test("waits for a swipe a margin past how far a narrow row sat open before acting", () => {
  const narrow = { rowWidth: 288, openPx: 112, actPastOpenPx: 48 };

  expect(
    [150, 165].map(
      (travel) => swipeOutcome({ travel, ...narrow }, EITHER_SIDE).kind,
    ),
  ).toEqual(["reveal", "act"]);
});

test("acts on a swipe past half an open row when it asks for no margin", () => {
  const narrow = { rowWidth: 288, openPx: 112, actPastOpenPx: 0 };

  expect(swipeOutcome({ travel: 150, ...narrow }, EITHER_SIDE)).toEqual({
    kind: "act",
    side: "towardEnd",
  });
});

test("acts on a swipe past half a closed row whatever margin it asks for", () => {
  const closed = { rowWidth: 358, openPx: 0, actPastOpenPx: 48 };

  expect(swipeOutcome({ travel: 180, ...closed }, EITHER_SIDE)).toEqual({
    kind: "act",
    side: "towardEnd",
  });
});

test("springs back from a swipe toward a side with nothing to do", () => {
  const onlyTowardEnd = (side: SwipeSide): boolean => side === "towardEnd";

  expect(swipeOutcome({ travel: -250, ...ROW }, onlyTowardEnd)).toEqual({
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

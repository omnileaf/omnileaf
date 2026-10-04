import { expect, test } from "vitest";

import { Swipe } from "./swipe";

const MIN_DISTANCE_PX = 48;

type Point = readonly [x: number, y: number];

function pointer(type: string, [x, y]: Point): PointerEvent {
  return new PointerEvent(type, {
    clientX: x,
    clientY: y,
    pointerType: "touch",
  });
}

function startedAt(point: Point): Swipe {
  const swipe = new Swipe(MIN_DISTANCE_PX);
  swipe.started(pointer("pointerdown", point));
  return swipe;
}

function swipe(from: Point, to: Point): ReturnType<Swipe["ended"]> {
  return startedAt(from).ended(pointer("pointerup", to));
}

test("turns to the next page for a swipe from right to left", () => {
  const turn = swipe([300, 400], [200, 410]);

  expect(turn).toBe("next");
});

test("turns back for a swipe from left to right", () => {
  const turn = swipe([100, 400], [220, 390]);

  expect(turn).toBe("previous");
});

test("turns no page for a tap, a short drag or a mostly vertical one", () => {
  const turns = [
    swipe([200, 400], [200, 400]),
    swipe([200, 400], [200 - MIN_DISTANCE_PX + 1, 400]),
    swipe([200, 400], [140, 500]),
  ];

  expect(turns).toEqual([undefined, undefined, undefined]);
});

test("swallows the click a swipe ends with, and only that one", () => {
  const swiped = startedAt([300, 400]);
  swiped.ended(pointer("pointerup", [100, 400]));

  const clicks = [swiped.isClickASwipe(), swiped.isClickASwipe()];

  expect(clicks).toEqual([true, false]);
});

test("lets the click after a tap through", () => {
  const tapped = startedAt([300, 400]);
  tapped.ended(pointer("pointerup", [302, 401]));

  expect(tapped.isClickASwipe()).toBe(false);
});

test("forgets a swipe the browser took over before it ended", () => {
  const taken = startedAt([300, 400]);

  taken.cancelled();

  expect(taken.ended(pointer("pointerup", [100, 400]))).toBeUndefined();
  expect(taken.isClickASwipe()).toBe(false);
});

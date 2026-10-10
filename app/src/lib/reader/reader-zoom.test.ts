import { expect, test } from "vitest";

import { isZoomedIn, zoneAction } from "./reader-zoom";

const AT_REST = 1;
const PINCHED = 2;

test("counts a page as zoomed in only once pinched past its resting scale", () => {
  const zoomed = [AT_REST, 1.001, 1.5, PINCHED].map(isZoomedIn);

  expect(zoomed).toEqual([false, false, true, true]);
});

test("turns no page with a tap at the page's edges while zoomed in", () => {
  const actions = [
    zoneAction("next", PINCHED),
    zoneAction("previous", PINCHED),
  ];

  expect(actions).toEqual([undefined, undefined]);
});

test("still shows or hides the controls with a tap in the middle while zoomed in", () => {
  const action = zoneAction("toggleControls", PINCHED);

  expect(action).toBe("toggleControls");
});

test("turns pages with taps at the edges once zoomed back out", () => {
  const actions = [
    zoneAction("next", AT_REST),
    zoneAction("previous", AT_REST),
  ];

  expect(actions).toEqual(["next", "previous"]);
});

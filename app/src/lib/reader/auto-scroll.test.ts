import { expect, test } from "vitest";

import {
  autoScrollSpeed,
  fasterSpeed,
  pixelsScrolled,
  slowerSpeed,
} from "./auto-scroll";

test("scrolls at the pages a minute set, until my pace is chosen", () => {
  expect(
    autoScrollSpeed({ choice: "set", pagesPerMinute: 2, secondsPerPage: 30 }),
  ).toEqual({ pagesPerMinute: 2, isMyPace: false });
});

test("scrolls at my pace once it's chosen and the reading speed is known", () => {
  expect(
    autoScrollSpeed({
      choice: "myPace",
      pagesPerMinute: 2,
      secondsPerPage: 40,
    }),
  ).toEqual({ pagesPerMinute: 1.5, isMyPace: true });
});

test("falls back to the pages a minute set while my pace isn't known", () => {
  expect(
    autoScrollSpeed({
      choice: "myPace",
      pagesPerMinute: 3,
      secondsPerPage: null,
    }),
  ).toEqual({ pagesPerMinute: 3, isMyPace: false });
});

test("scrolls a page's height for each page a minute's share of the time", () => {
  expect(pixelsScrolled(30_000, 2, 1_200)).toBe(1_200);
});

test("steps the set speed half a page a minute at a time, within its bounds", () => {
  expect([
    fasterSpeed(2),
    slowerSpeed(2),
    slowerSpeed(0.5),
    fasterSpeed(10),
  ]).toEqual([2.5, 1.5, 0.5, 10]);
});

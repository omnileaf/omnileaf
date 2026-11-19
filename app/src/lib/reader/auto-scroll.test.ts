import { expect, test } from "vitest";

import {
  autoScrollSpeed,
  fasterSpeed,
  pixelsScrolled,
  slowerSpeed,
} from "./auto-scroll";

test("scrolls at the screens a minute set, until my pace is chosen", () => {
  expect(
    autoScrollSpeed({
      choice: "set",
      screensPerMinute: 3,
      secondsPerPage: 30,
    }),
  ).toEqual({ kind: "set", screensPerMinute: 3 });
});

test("scrolls at my pace once it's chosen and the reading speed is known", () => {
  expect(
    autoScrollSpeed({
      choice: "myPace",
      screensPerMinute: 3,
      secondsPerPage: 40,
    }),
  ).toEqual({ kind: "myPace", pagesPerMinute: 1.5 });
});

test("falls back to the screens a minute set while my pace isn't known", () => {
  expect(
    autoScrollSpeed({
      choice: "myPace",
      screensPerMinute: 4,
      secondsPerPage: null,
    }),
  ).toEqual({ kind: "set", screensPerMinute: 4 });
});

test("scrolls the strip's shown height for each screen a minute's share of the time", () => {
  expect(
    pixelsScrolled(
      20_000,
      { kind: "set", screensPerMinute: 3 },
      { page: 2_400, screen: 800 },
    ),
  ).toBe(800);
});

test("scrolls the shown page's height for each page a minute at my pace", () => {
  expect(
    pixelsScrolled(
      30_000,
      { kind: "myPace", pagesPerMinute: 2 },
      { page: 1_200, screen: 800 },
    ),
  ).toBe(1_200);
});

test("steps the set speed one screen a minute at a time, from 1 to 12", () => {
  expect([
    fasterSpeed(3),
    slowerSpeed(3),
    slowerSpeed(1),
    fasterSpeed(12),
  ]).toEqual([4, 2, 1, 12]);
});

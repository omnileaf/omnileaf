import { expect, test } from "vitest";

import {
  headingsBefore,
  offsetOf,
  type Stack,
  stackWindow,
} from "./stack-window";

const ROW = 72;
const HEADING = 44;
const NO_EXTRA_ROWS = 0;

function runsOf(...lengths: readonly number[]): readonly boolean[] {
  return lengths.flatMap((length) => [
    true,
    ...Array.from({ length }, () => false),
  ]);
}

function stackOf(isHeading: readonly boolean[]): Stack {
  return {
    count: isHeading.length,
    heights: { row: ROW, heading: HEADING },
    headingsBefore: headingsBefore(isHeading),
  };
}

test("counts the headings before each row", () => {
  expect(headingsBefore(runsOf(2, 1))).toEqual([0, 1, 1, 1, 2, 2]);
});

test("places each row after the rows and shorter headings above it", () => {
  const stack = stackOf(runsOf(2, 1));

  expect([0, 1, 2, 3, 4, 5].map((index) => offsetOf(stack, index))).toEqual([
    0,
    HEADING,
    HEADING + ROW,
    HEADING + 2 * ROW,
    2 * HEADING + 2 * ROW,
    2 * HEADING + 3 * ROW,
  ]);
});

test("makes room for every row and heading at its own height", () => {
  const window = stackWindow(
    stackOf(runsOf(12, 12)),
    { top: 0, bottom: 100 },
    NO_EXTRA_ROWS,
  );

  expect(window.size).toBe(2 * HEADING + 24 * ROW);
});

test("starts at the row the screen's top falls in, past shorter headings", () => {
  const stack = stackOf(runsOf(12, 12));
  const secondRunsFirstRow = 14;
  const top = offsetOf(stack, secondRunsFirstRow) + ROW / 2;

  const window = stackWindow(
    stack,
    { top, bottom: top + 3 * ROW },
    NO_EXTRA_ROWS,
  );

  expect(window.start).toBe(secondRunsFirstRow);
  expect(window.before).toBe(offsetOf(stack, secondRunsFirstRow));
  expect(window.end).toBe(secondRunsFirstRow + 4);
});

test("keeps extra rows on either side of the screen", () => {
  const stack = stackOf(runsOf(12, 12));
  const top = offsetOf(stack, 14);

  const window = stackWindow(stack, { top, bottom: top + ROW }, 2);

  expect([window.start, window.end]).toEqual([12, 17]);
});

test("lays out no rows while the list is far below the screen", () => {
  const window = stackWindow(
    stackOf(runsOf(12)),
    { top: -900, bottom: -100 },
    NO_EXTRA_ROWS,
  );

  expect([window.start, window.end, window.before]).toEqual([0, 0, 0]);
});

test("lays out no rows once the list is far above the screen", () => {
  const stack = stackOf(runsOf(12));

  const window = stackWindow(stack, { top: 5000, bottom: 5800 }, NO_EXTRA_ROWS);

  expect([window.start, window.end]).toEqual([13, 13]);
  expect(window.before).toBe(window.size);
});

test("lays out nothing for an empty list", () => {
  const window = stackWindow(
    stackOf([]),
    { top: 0, bottom: 800 },
    NO_EXTRA_ROWS,
  );

  expect(window).toEqual({ start: 0, end: 0, before: 0, size: 0 });
});

test("counts rows yet to come as rows", () => {
  const stack = { ...stackOf(runsOf(2)), count: 5 };

  const window = stackWindow(stack, { top: 0, bottom: 100 }, NO_EXTRA_ROWS);

  expect(window.size).toBe(HEADING + 4 * ROW);
});

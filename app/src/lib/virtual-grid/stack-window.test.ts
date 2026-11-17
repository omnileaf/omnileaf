import { expect, test } from "vitest";

import { RowHeights, type RowLayout, stackWindow } from "./stack-window";

const ROW = 72;
const HEADING = 44;
const NO_EXTRA_ROWS = 0;

function runsOf(...lengths: readonly number[]): readonly boolean[] {
  return lengths.flatMap((length) => [
    true,
    ...Array.from({ length }, () => false),
  ]);
}

function layoutOf(
  isHeading: readonly boolean[],
  count = isHeading.length,
): RowLayout {
  return { count, isHeading, strides: { row: ROW, heading: HEADING } };
}

function heightsOf(
  isHeading: readonly boolean[],
  count = isHeading.length,
): RowHeights {
  return new RowHeights(layoutOf(isHeading, count));
}

test("places each row after the rows and shorter headings above it", () => {
  const heights = heightsOf(runsOf(2, 1));

  expect([0, 1, 2, 3, 4, 5].map((index) => heights.offsetOf(index))).toEqual([
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
    heightsOf(runsOf(12, 12)),
    { top: 0, bottom: 100 },
    NO_EXTRA_ROWS,
  );

  expect(window.size).toBe(2 * HEADING + 24 * ROW);
});

test("starts at the row the screen's top falls in, past shorter headings", () => {
  const heights = heightsOf(runsOf(12, 12));
  const secondRunsFirstRow = 14;
  const top = heights.offsetOf(secondRunsFirstRow) + ROW / 2;

  const window = stackWindow(
    heights,
    { top, bottom: top + 3 * ROW },
    NO_EXTRA_ROWS,
  );

  expect(window.start).toBe(secondRunsFirstRow);
  expect(window.before).toBe(heights.offsetOf(secondRunsFirstRow));
  expect(window.end).toBe(secondRunsFirstRow + 4);
});

test("keeps extra rows on either side of the screen", () => {
  const heights = heightsOf(runsOf(12, 12));
  const top = heights.offsetOf(14);

  const window = stackWindow(heights, { top, bottom: top + ROW }, 2);

  expect([window.start, window.end]).toEqual([12, 17]);
});

test("lays out no rows while the list is far below the screen", () => {
  const window = stackWindow(
    heightsOf(runsOf(12)),
    { top: -900, bottom: -100 },
    NO_EXTRA_ROWS,
  );

  expect([window.start, window.end, window.before]).toEqual([0, 0, 0]);
});

test("lays out no rows once the list is far above the screen", () => {
  const heights = heightsOf(runsOf(12));

  const window = stackWindow(
    heights,
    { top: 5000, bottom: 5800 },
    NO_EXTRA_ROWS,
  );

  expect([window.start, window.end]).toEqual([13, 13]);
  expect(window.before).toBe(window.size);
});

test("lays out nothing for an empty list", () => {
  const window = stackWindow(
    heightsOf([]),
    { top: 0, bottom: 800 },
    NO_EXTRA_ROWS,
  );

  expect(window).toEqual({ start: 0, end: 0, before: 0, size: 0 });
});

test("counts rows yet to come as rows", () => {
  const heights = heightsOf(runsOf(2), 5);

  const window = stackWindow(heights, { top: 0, bottom: 100 }, NO_EXTRA_ROWS);

  expect(window.size).toBe(HEADING + 4 * ROW);
});

test("places measured rows and headings at their own heights", () => {
  const heights = heightsOf(runsOf(3)).remeasured(
    new Map([
      [0, 50],
      [1, 56],
      [2, 88],
      [3, 56],
    ]),
  );

  expect([0, 1, 2, 3, 4].map((index) => heights.offsetOf(index))).toEqual([
    0, 50, 106, 194, 250,
  ]);
});

test("makes room for every row at its measured height", () => {
  const heights = heightsOf(runsOf(2)).remeasured(
    new Map([
      [1, 120],
      [2, 40],
    ]),
  );

  const window = stackWindow(heights, { top: 0, bottom: 100 }, NO_EXTRA_ROWS);

  expect(window.size).toBe(HEADING + 160);
});

test("starts at the row the screen's top falls in among rows of different heights", () => {
  const heights = heightsOf(runsOf(4)).remeasured(
    new Map([
      [1, 56],
      [2, 200],
      [3, 56],
      [4, 200],
    ]),
  );
  const top = heights.offsetOf(3) + 10;

  const window = stackWindow(
    heights,
    { top, bottom: top + 100 },
    NO_EXTRA_ROWS,
  );

  expect([window.start, window.end]).toEqual([3, 5]);
  expect(window.before).toBe(HEADING + 256);
});

test("estimates rows not yet drawn from the median measured row", () => {
  const heights = heightsOf(runsOf(5)).remeasured(
    new Map([
      [1, 200],
      [2, 40],
      [3, 60],
    ]),
  );

  expect(heights.offsetOf(6) - heights.offsetOf(4)).toBe(2 * 60);
});

test("estimates from the middle two rows when an even number are measured", () => {
  const heights = heightsOf(runsOf(5)).remeasured(
    new Map([
      [1, 60],
      [2, 200],
      [3, 10],
      [4, 40],
    ]),
  );

  expect(heights.offsetOf(6) - heights.offsetOf(5)).toBe(50);
});

test("estimates headings not yet drawn from the heading stride alone", () => {
  const heights = heightsOf(runsOf(1, 1)).remeasured(
    new Map([
      [0, 30],
      [1, 90],
    ]),
  );

  expect(heights.offsetOf(3) - heights.offsetOf(2)).toBe(HEADING);
  expect(heights.offsetOf(4) - heights.offsetOf(3)).toBe(90);
});

test("keeps the heights measured before the list grew by a page", () => {
  const measuredBeforeGrowing = new Map([
    [1, 120],
    [2, 40],
    [3, 120],
  ]);

  const heights = new RowHeights(layoutOf(runsOf(3, 3)), measuredBeforeGrowing);

  expect(
    [1, 2, 3, 4, 5].map(
      (index) => heights.offsetOf(index + 1) - heights.offsetOf(index),
    ),
  ).toEqual([120, 40, 120, HEADING, 120]);
});

test("builds heights without measurements of rows outside the list", () => {
  const heights = new RowHeights(
    layoutOf(runsOf(2)),
    new Map([
      [-1, 500],
      [3, 500],
    ]),
  );

  expect(heights.offsetOf(3)).toBe(HEADING + 2 * ROW);
});

test("keeps the same heights when every measurement repeats", () => {
  const heights = heightsOf(runsOf(2)).remeasured(new Map([[1, 56]]));

  expect(heights.remeasured(new Map([[1, 56]]))).toBe(heights);
});

test("ignores measurements of rows past the end of the list", () => {
  const heights = heightsOf(runsOf(2));

  expect(heights.remeasured(new Map([[3, 500]]))).toBe(heights);
});

test("ignores measurements of rows before the start of the list", () => {
  const heights = heightsOf(runsOf(2));

  expect(heights.remeasured(new Map([[-1, 500]]))).toBe(heights);
});

test("refuses to place a row past the end of the list", () => {
  const heights = heightsOf(runsOf(2));

  expect(() => heights.offsetOf(4)).toThrow(RangeError);
});

test("finds the row an offset falls in among rows of different heights", () => {
  const heights = heightsOf(runsOf(3)).remeasured(
    new Map([
      [1, 56],
      [2, 88],
    ]),
  );

  expect(
    [0, HEADING - 1, HEADING, HEADING + 56, HEADING + 143].map((offset) =>
      heights.rowAt(offset),
    ),
  ).toEqual([0, 0, 1, 2, 2]);
});

test("finds the first row for an offset above the list", () => {
  const heights = heightsOf(runsOf(2));

  expect(heights.rowAt(-100)).toBe(0);
});

test("finds the end of the list for an offset below its last row", () => {
  const heights = heightsOf(runsOf(2));

  expect(heights.rowAt(heights.offsetOf(3))).toBe(3);
});

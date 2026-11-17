import { expect, test } from "vitest";

import {
  offsetOf,
  type RowHeights,
  remeasured,
  rowHeights,
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

function stackOf(
  isHeading: readonly boolean[],
  count = isHeading.length,
): RowHeights {
  return rowHeights({
    count,
    isHeading,
    strides: { row: ROW, heading: HEADING },
  });
}

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
  const stack = stackOf(runsOf(2), 5);

  const window = stackWindow(stack, { top: 0, bottom: 100 }, NO_EXTRA_ROWS);

  expect(window.size).toBe(HEADING + 4 * ROW);
});

test("places measured rows and headings at their own heights", () => {
  const stack = remeasured(
    stackOf(runsOf(3)),
    new Map([
      [0, 50],
      [1, 56],
      [2, 88],
      [3, 56],
    ]),
  );

  expect([0, 1, 2, 3, 4].map((index) => offsetOf(stack, index))).toEqual([
    0, 50, 106, 194, 250,
  ]);
});

test("makes room for every row at its measured height", () => {
  const stack = remeasured(
    stackOf(runsOf(2)),
    new Map([
      [1, 120],
      [2, 40],
    ]),
  );

  const window = stackWindow(stack, { top: 0, bottom: 100 }, NO_EXTRA_ROWS);

  expect(window.size).toBe(HEADING + 160);
});

test("starts at the row the screen's top falls in among rows of different heights", () => {
  const stack = remeasured(
    stackOf(runsOf(4)),
    new Map([
      [1, 56],
      [2, 200],
      [3, 56],
      [4, 200],
    ]),
  );
  const top = offsetOf(stack, 3) + 10;

  const window = stackWindow(stack, { top, bottom: top + 100 }, NO_EXTRA_ROWS);

  expect([window.start, window.end]).toEqual([3, 5]);
  expect(window.before).toBe(HEADING + 256);
});

test("estimates rows not yet drawn from the median measured row", () => {
  const stack = remeasured(
    stackOf(runsOf(5)),
    new Map([
      [1, 200],
      [2, 40],
      [3, 60],
    ]),
  );

  expect(offsetOf(stack, 6) - offsetOf(stack, 4)).toBe(2 * 60);
});

test("estimates from the middle two rows when an even number are measured", () => {
  const stack = remeasured(
    stackOf(runsOf(5)),
    new Map([
      [1, 60],
      [2, 200],
      [3, 10],
      [4, 40],
    ]),
  );

  expect(offsetOf(stack, 6) - offsetOf(stack, 5)).toBe(50);
});

test("estimates headings not yet drawn from the heading stride alone", () => {
  const stack = remeasured(
    stackOf(runsOf(1, 1)),
    new Map([
      [0, 30],
      [1, 90],
    ]),
  );

  expect(offsetOf(stack, 3) - offsetOf(stack, 2)).toBe(HEADING);
  expect(offsetOf(stack, 4) - offsetOf(stack, 3)).toBe(90);
});

test("keeps the same heights when every measurement repeats", () => {
  const stack = remeasured(stackOf(runsOf(2)), new Map([[1, 56]]));

  expect(remeasured(stack, new Map([[1, 56]]))).toBe(stack);
});

test("ignores measurements of rows past the end of the list", () => {
  const stack = stackOf(runsOf(2));

  expect(remeasured(stack, new Map([[3, 500]]))).toBe(stack);
});

test("ignores measurements of rows before the start of the list", () => {
  const stack = stackOf(runsOf(2));

  expect(remeasured(stack, new Map([[-1, 500]]))).toBe(stack);
});

test("refuses to place a row past the end of the list", () => {
  const stack = stackOf(runsOf(2));

  expect(() => offsetOf(stack, 4)).toThrow(RangeError);
});

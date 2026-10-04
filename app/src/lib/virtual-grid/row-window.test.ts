import { expect, test } from "vitest";

import { type GridShape, rowWindow } from "./row-window";

const ROW_STRIDE = 100;
const TEN_ROWS_OF_THREE: GridShape = {
  count: 30,
  columns: 3,
  rowStride: ROW_STRIDE,
};
const NO_EXTRA_ROWS = 0;

test("starts at the first item while the grid's top is on screen", () => {
  const window = rowWindow(
    TEN_ROWS_OF_THREE,
    { top: -50, bottom: 250 },
    NO_EXTRA_ROWS,
  );

  expect(window).toEqual({ firstRow: 0, rows: 10, start: 0, end: 9 });
});

test("leaves out the rows scrolled past", () => {
  const window = rowWindow(
    TEN_ROWS_OF_THREE,
    { top: 420, bottom: 610 },
    NO_EXTRA_ROWS,
  );

  expect(window).toEqual({ firstRow: 4, rows: 10, start: 12, end: 21 });
});

test("keeps extra rows on either side of the screen", () => {
  const window = rowWindow(TEN_ROWS_OF_THREE, { top: 420, bottom: 610 }, 2);

  expect(window).toEqual({ firstRow: 2, rows: 10, start: 6, end: 27 });
});

test("ends at the last item when the last row isn't full", () => {
  const window = rowWindow(
    { count: 29, columns: 3, rowStride: ROW_STRIDE },
    { top: 800, bottom: 1200 },
    NO_EXTRA_ROWS,
  );

  expect(window).toEqual({ firstRow: 8, rows: 10, start: 24, end: 29 });
});

test("lays out no items while the grid is far below the screen", () => {
  const window = rowWindow(
    TEN_ROWS_OF_THREE,
    { top: -900, bottom: -100 },
    NO_EXTRA_ROWS,
  );

  expect(window).toEqual({ firstRow: 0, rows: 10, start: 0, end: 0 });
});

test("lays out no items once the grid is far above the screen", () => {
  const window = rowWindow(
    TEN_ROWS_OF_THREE,
    { top: 1500, bottom: 2300 },
    NO_EXTRA_ROWS,
  );

  expect(window).toEqual({ firstRow: 10, rows: 10, start: 30, end: 30 });
});

test("counts a part-filled last row as a row", () => {
  const window = rowWindow(
    { count: 31, columns: 3, rowStride: ROW_STRIDE },
    { top: 0, bottom: 100 },
    NO_EXTRA_ROWS,
  );

  expect(window.rows).toBe(11);
});

test("lays out nothing for an empty grid", () => {
  const window = rowWindow(
    { count: 0, columns: 3, rowStride: ROW_STRIDE },
    { top: 0, bottom: 800 },
    NO_EXTRA_ROWS,
  );

  expect(window).toEqual({ firstRow: 0, rows: 0, start: 0, end: 0 });
});

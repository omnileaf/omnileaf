import { expect, test } from "vitest";

import { sheetBackProgressOf, sheetBackShape } from "./sheet-back";

const LIBRARY_SHEET = { width: 392, height: 600 };

test("leaves a sheet at rest as it is", () => {
  expect(sheetBackShape(LIBRARY_SHEET, 0)).toEqual({
    scale: 1,
    layoutHeight: 600,
  });
});

test("makes a sheet 48 px narrower and 24 px shorter at full progress", () => {
  const { scale, layoutHeight } = sheetBackShape(LIBRARY_SHEET, 1);

  expect(LIBRARY_SHEET.width * scale).toBeCloseTo(392 - 48);
  expect(layoutHeight * scale).toBeCloseTo(600 - 24);
});

test("makes it half as much narrower and shorter at half progress", () => {
  const { scale, layoutHeight } = sheetBackShape(LIBRARY_SHEET, 0.5);

  expect(LIBRARY_SHEET.width * scale).toBeCloseTo(392 - 24);
  expect(layoutHeight * scale).toBeCloseTo(600 - 12);
});

test("shrinks everything evenly by the horizontal factor, laying the sheet out taller to make up the height", () => {
  const { scale, layoutHeight } = sheetBackShape(LIBRARY_SHEET, 1);

  expect(scale).toBeCloseTo(0.878, 3);
  expect(layoutHeight).toBeGreaterThan(LIBRARY_SHEET.height);
});

test("shrinks a sheet in proportion to its own size", () => {
  const { scale, layoutHeight } = sheetBackShape(
    { width: 800, height: 300 },
    1,
  );

  expect(scale).toBeCloseTo(1 - 48 / 800);
  expect(layoutHeight * scale).toBeCloseTo(300 - 24);
});

test("tells the progress a shape stands for", () => {
  const shape = sheetBackShape(LIBRARY_SHEET, 0.37);

  expect(sheetBackProgressOf(LIBRARY_SHEET, shape)).toBeCloseTo(0.37);
});

test("tells a sheet at rest has made no progress", () => {
  const shape = sheetBackShape(LIBRARY_SHEET, 0);

  expect(sheetBackProgressOf(LIBRARY_SHEET, shape)).toBe(0);
});

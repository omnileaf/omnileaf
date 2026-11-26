import { expect, test } from "vitest";

import { sheetBackProgressOf, sheetBackShape } from "./sheet-back";

const LIBRARY_SHEET = { width: 392, height: 600 };

test("leaves a sheet at rest as it is", () => {
  expect(sheetBackShape(LIBRARY_SHEET, 0)).toEqual({
    scaleX: 1,
    scaleY: 1,
    contentScaleY: 1,
  });
});

test("makes a sheet 48 px narrower and 24 px shorter at full progress", () => {
  const { scaleX, scaleY } = sheetBackShape(LIBRARY_SHEET, 1);

  expect(LIBRARY_SHEET.width * scaleX).toBeCloseTo(392 - 48);
  expect(LIBRARY_SHEET.height * scaleY).toBeCloseTo(600 - 24);
});

test("makes it half as much narrower and shorter at half progress", () => {
  const { scaleX, scaleY } = sheetBackShape(LIBRARY_SHEET, 0.5);

  expect(LIBRARY_SHEET.width * scaleX).toBeCloseTo(392 - 24);
  expect(LIBRARY_SHEET.height * scaleY).toBeCloseTo(600 - 12);
});

test("scales the content back so it shrinks evenly by the horizontal factor", () => {
  const { scaleX, scaleY, contentScaleY } = sheetBackShape(LIBRARY_SHEET, 1);

  expect(scaleX).toBeCloseTo(0.878, 3);
  expect(scaleY * contentScaleY).toBeCloseTo(scaleX);
});

test("shrinks a sheet in proportion to its own size", () => {
  const { scaleX, scaleY } = sheetBackShape({ width: 800, height: 300 }, 1);

  expect(scaleX).toBeCloseTo(1 - 48 / 800);
  expect(scaleY).toBeCloseTo(1 - 24 / 300);
});

test("tells the progress a shape stands for", () => {
  const shape = sheetBackShape(LIBRARY_SHEET, 0.37);

  expect(sheetBackProgressOf(LIBRARY_SHEET, shape)).toBeCloseTo(0.37);
});

test("tells a sheet at rest has made no progress", () => {
  const shape = sheetBackShape(LIBRARY_SHEET, 0);

  expect(sheetBackProgressOf(LIBRARY_SHEET, shape)).toBe(0);
});

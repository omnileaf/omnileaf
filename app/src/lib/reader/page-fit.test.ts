import { expect, test } from "vitest";

import { fittedSize, fittedTo } from "./page-fit";

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const SPACE = { width: 400, height: 800 };

test("fits a portrait page to the width of a tall screen", () => {
  const size = fittedSize({ width: 1800, height: 2700 }, PHONE);

  expect(size).toEqual({ width: 390, height: 585 });
});

test("fits a portrait page to the height of a wide screen", () => {
  const size = fittedSize({ width: 1800, height: 2700 }, DESKTOP);

  expect(size).toEqual({ width: 800 * (1800 / 2700), height: 800 });
});

test("scales a page smaller than the screen up to fill it", () => {
  const size = fittedSize({ width: 400, height: 600 }, DESKTOP);

  expect(size.height).toBe(800);
});

test("shows nothing for a page or a space with no area", () => {
  const sizes = [
    fittedSize({ width: 0, height: 600 }, DESKTOP),
    fittedSize({ width: 400, height: 600 }, { width: 0, height: 0 }),
  ];

  expect(sizes).toEqual([
    { width: 0, height: 0 },
    { width: 0, height: 0 },
  ]);
});

test("fits a page to the space's width, however tall that makes it", () => {
  expect(fittedTo({ width: 1000, height: 1500 }, SPACE, "width")).toEqual({
    width: 400,
    height: 600,
  });
});

test("fits a page to the space's height, however wide that makes it", () => {
  expect(fittedTo({ width: 3000, height: 1500 }, SPACE, "height")).toEqual({
    width: 1600,
    height: 800,
  });
});

test("fits a page inside the space when fitting the screen", () => {
  expect(fittedTo({ width: 1000, height: 1500 }, SPACE, "screen")).toEqual(
    fittedSize({ width: 1000, height: 1500 }, SPACE),
  );
});

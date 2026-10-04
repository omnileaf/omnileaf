import { expect, test } from "vitest";

import { fittedSize } from "./page-fit";

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

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

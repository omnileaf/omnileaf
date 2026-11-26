import { expect, test } from "vitest";

import { cellsAround } from "./page-cells";

const SINGLES = [[0], [1], [2], [3], [4], [5], [6]];
const PAIRS = [[0], [1, 2], [3, 4], [5, 6], [7, 8]];

test("places each kept page's spread by how many turns away it is", () => {
  const cells = cellsAround(SINGLES, 2, [1, 2, 3, 4]);

  expect(cells).toEqual([
    { spread: [1], offset: -1 },
    { spread: [2], offset: 0 },
    { spread: [3], offset: 1 },
    { spread: [4], offset: 2 },
  ]);
});

test("keeps the whole spread on either side, even past the kept pages", () => {
  const cells = cellsAround(PAIRS, 2, [2, 3, 4]);

  expect(cells).toEqual([
    { spread: [1, 2], offset: -1 },
    { spread: [3, 4], offset: 0 },
    { spread: [5, 6], offset: 1 },
  ]);
});

test("puts the last spread one turn back from past the end", () => {
  const cells = cellsAround(SINGLES, SINGLES.length, [5, 6]);

  expect(cells).toEqual([
    { spread: [5], offset: -2 },
    { spread: [6], offset: -1 },
  ]);
});

test("has nothing before the first spread", () => {
  const cells = cellsAround(SINGLES, 0, [0, 1]);

  expect(cells).toEqual([
    { spread: [0], offset: 0 },
    { spread: [1], offset: 1 },
  ]);
});

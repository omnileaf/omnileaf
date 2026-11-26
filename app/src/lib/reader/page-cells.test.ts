import { expect, test } from "vitest";

import { cellsAround } from "./page-cells";

const SINGLES = [[0], [1], [2], [3], [4], [5], [6]];
const PAIRS = [[0], [1, 2], [3, 4], [5, 6], [7, 8]];

function resting(at: number): { at: number; low: number; high: number } {
  return { at, low: at, high: at };
}

test("places each kept page's spread by how many turns away it is", () => {
  const cells = cellsAround(SINGLES, resting(2), [1, 2, 3, 4]);

  expect(cells).toEqual([
    { spread: [1], offset: -1 },
    { spread: [2], offset: 0 },
    { spread: [3], offset: 1 },
    { spread: [4], offset: 2 },
  ]);
});

test("keeps the whole spread on either side, even past the kept pages", () => {
  const cells = cellsAround(PAIRS, resting(2), [2, 3, 4]);

  expect(cells).toEqual([
    { spread: [1, 2], offset: -1 },
    { spread: [3, 4], offset: 0 },
    { spread: [5, 6], offset: 1 },
  ]);
});

test("keeps every spread a run of turns passed through until it settles", () => {
  const cells = cellsAround(SINGLES, { at: 4, low: 2, high: 4 }, [3, 4, 5]);

  expect(cells).toEqual([
    { spread: [1], offset: -3 },
    { spread: [2], offset: -2 },
    { spread: [3], offset: -1 },
    { spread: [4], offset: 0 },
    { spread: [5], offset: 1 },
  ]);
});

test("puts the last spread one turn back from past the end", () => {
  const cells = cellsAround(SINGLES, resting(SINGLES.length), [5, 6]);

  expect(cells).toEqual([
    { spread: [5], offset: -2 },
    { spread: [6], offset: -1 },
  ]);
});

test("has nothing before the first spread", () => {
  const cells = cellsAround(SINGLES, { at: 0, low: -1, high: 0 }, [0, 1]);

  expect(cells).toEqual([
    { spread: [0], offset: 0 },
    { spread: [1], offset: 1 },
  ]);
});

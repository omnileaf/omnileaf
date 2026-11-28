import { expect, test } from "vitest";

import { pagesAround, pagesAroundScreen } from "./page-window";

const READING_ON = { ahead: 3, behind: 1 };
const READING_BACK = { ahead: 1, behind: 3 };

test("keeps the pages asked for on each side of the one shown", () => {
  const kept = pagesAround(5, 30, READING_ON);

  expect(kept).toEqual([4, 5, 6, 7, 8]);
});

test("keeps as many pages behind when reading back as ahead when reading on", () => {
  const kept = pagesAround(5, 30, READING_BACK);

  expect(kept).toEqual([2, 3, 4, 5, 6]);
});

test("keeps only pages within the book at either end", () => {
  const atStart = pagesAround(0, 30, READING_ON);
  const atEnd = pagesAround(29, 30, READING_ON);
  const short = pagesAround(0, 1, READING_ON);

  expect([atStart, atEnd, short]).toEqual([[0, 1, 2, 3], [28, 29], [0]]);
});

const ON_SCREEN = { first: 10, last: 13 };

test("keeps every page on screen, and the pages asked for below and above it", () => {
  const cells = pagesAroundScreen(ON_SCREEN, 30, READING_ON);

  expect(cells).toEqual([
    { spread: [9], offset: -1 },
    { spread: [10], offset: 0 },
    { spread: [11], offset: 0 },
    { spread: [12], offset: 0 },
    { spread: [13], offset: 0 },
    { spread: [14], offset: 1 },
    { spread: [15], offset: 2 },
    { spread: [16], offset: 3 },
  ]);
});

test("keeps only the pages on screen when none are asked for around it", () => {
  const cells = pagesAroundScreen(ON_SCREEN, 30, { ahead: 0, behind: 0 });

  expect(cells.map(({ spread }) => spread[0])).toEqual([10, 11, 12, 13]);
});

test("keeps only pages within the book around a screen at either end", () => {
  const atStart = pagesAroundScreen({ first: 0, last: 1 }, 30, READING_BACK);
  const atEnd = pagesAroundScreen({ first: 28, last: 29 }, 30, READING_ON);

  expect(
    [atStart, atEnd].map((cells) => cells.map(({ spread }) => spread[0])),
  ).toEqual([
    [0, 1, 2],
    [27, 28, 29],
  ]);
});

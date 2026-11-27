import { expect, test } from "vitest";

import { pagesAround } from "./page-window";

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

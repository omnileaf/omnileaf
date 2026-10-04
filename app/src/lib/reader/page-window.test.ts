import { expect, test } from "vitest";

import { pagesAround } from "./page-window";

test("keeps the page before and the pages ahead of the one shown", () => {
  const kept = pagesAround(5, 30, 3);

  expect(kept).toEqual([4, 5, 6, 7, 8]);
});

test("keeps only pages within the book at either end", () => {
  const atStart = pagesAround(0, 30, 3);
  const atEnd = pagesAround(29, 30, 3);
  const short = pagesAround(0, 1, 3);

  expect([atStart, atEnd, short]).toEqual([[0, 1, 2, 3], [28, 29], [0]]);
});

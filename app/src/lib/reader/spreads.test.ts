import { expect, test } from "vitest";

import {
  spreadAt,
  spreadPosition,
  spreadsOf,
  widestSpreadPosition,
} from "./spreads";

const TALL = { width: 2, height: 3 };
const WIDE = { width: 4, height: 3 };

test("shows each page alone when one page shows at a time", () => {
  expect(spreadsOf([TALL, TALL, TALL], false)).toEqual([[0], [1], [2]]);
});

test("keeps the cover alone, then pairs the pages after it", () => {
  expect(spreadsOf([TALL, TALL, TALL, TALL, TALL], true)).toEqual([
    [0],
    [1, 2],
    [3, 4],
  ]);
});

test("keeps a wide page alone, and the page before it when it has no partner", () => {
  expect(spreadsOf([TALL, TALL, WIDE, TALL, TALL], true)).toEqual([
    [0],
    [1],
    [2],
    [3, 4],
  ]);
});

test("pairs pages whose size isn't known yet", () => {
  expect(spreadsOf([null, null, null], true)).toEqual([[0], [1, 2]]);
});

test("finds the spread that holds a page", () => {
  const spreads = spreadsOf([TALL, TALL, TALL, TALL, TALL], true);

  expect([0, 1, 2, 4].map((page) => spreadAt(spreads, page))).toEqual([
    0, 1, 1, 2,
  ]);
});

function pagesOfUnknownSize(count: number): null[] {
  return Array.from({ length: count }, () => null);
}

test("reserves the last page's label when pages show alone", () => {
  const spreads = spreadsOf(pagesOfUnknownSize(120), false);

  expect(widestSpreadPosition(spreads, 120)).toBe("120 / 120");
});

test("reserves the longest pair the book shows, not a pair of the page count", () => {
  const spreads = spreadsOf(pagesOfUnknownSize(100), true);

  expect(widestSpreadPosition(spreads, 100)).toBe("98–99 / 100");
});

const COUNTS = [1, 2, 3, 9, 10, 11, 99, 100, 101, 120, 999, 1000, 1001, 1234];

test.each(
  COUNTS.flatMap((count) =>
    [false, true].map((isTwoUp) => ({ count, isTwoUp })),
  ),
)(
  "shows no label longer than the reserve in a book of $count pages, two up $isTwoUp",
  ({ count, isTwoUp }) => {
    const spreads = spreadsOf(pagesOfUnknownSize(count), isTwoUp);

    const reserve = widestSpreadPosition(spreads, count).length;

    expect(
      spreads.filter(
        (spread) => spreadPosition(spread, count).length > reserve,
      ),
    ).toEqual([]);
  },
);

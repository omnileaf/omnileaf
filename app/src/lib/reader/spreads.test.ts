import { expect, test } from "vitest";

import { spreadAt, spreadsOf } from "./spreads";

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

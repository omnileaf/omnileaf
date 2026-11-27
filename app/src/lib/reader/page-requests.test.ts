import { expect, test } from "vitest";

import { nextPagesToAsk, pagesByUrgency } from "./page-requests";

const AROUND_PAGE_FIVE = [
  { spread: [4], offset: -1 },
  { spread: [5], offset: 0 },
  { spread: [6], offset: 1 },
  { spread: [7], offset: 2 },
  { spread: [8], offset: 3 },
];

test("puts the pages in view first, then the nearest ahead before the nearest behind when reading on", () => {
  const pages = pagesByUrgency(AROUND_PAGE_FIVE, "forward");

  expect(pages).toEqual([5, 6, 4, 7, 8]);
});

test("puts the nearest behind before the nearest ahead when reading back", () => {
  const pages = pagesByUrgency(AROUND_PAGE_FIVE, "back");

  expect(pages).toEqual([5, 4, 6, 7, 8]);
});

test("keeps both pages of a spread together", () => {
  const pages = pagesByUrgency(
    [
      { spread: [3, 4], offset: -1 },
      { spread: [5, 6], offset: 0 },
      { spread: [7, 8], offset: 1 },
    ],
    "forward",
  );

  expect(pages).toEqual([5, 6, 7, 8, 3, 4]);
});

test("asks for the most urgent pages not yet asked for, as many as there is room for", () => {
  const next = nextPagesToAsk([5, 6, 4, 7, 8], new Set([5]), 2);

  expect(next).toEqual([6, 4]);
});

test("asks for nothing while there is no room", () => {
  const next = nextPagesToAsk([5, 6, 4], new Set(), 0);

  expect(next).toEqual([]);
});

test("asks for nothing once every page wanted is asked for", () => {
  const next = nextPagesToAsk([5, 6], new Set([5, 6]), 3);

  expect(next).toEqual([]);
});

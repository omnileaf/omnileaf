import { expect, test } from "vitest";

import { barRows } from "#lib/bars.ts";

test("scales every bar against the longest", () => {
  expect(
    barRows([
      { label: "linux", count: 8 },
      { label: "android", count: 4 },
      { label: "ios", count: 2 },
    ]),
  ).toEqual([
    { label: "linux", count: 8, percent: 100 },
    { label: "android", count: 4, percent: 50 },
    { label: "ios", count: 2, percent: 25 },
  ]);
});

test("keeps the order it is given", () => {
  const labels = barRows([
    { label: "b", count: 1 },
    { label: "a", count: 3 },
  ]).map(({ label }) => label);

  expect(labels).toEqual(["b", "a"]);
});

test("never rounds a real count down to an invisible bar", () => {
  const [small] = barRows([
    { label: "linux", count: 500 },
    { label: "ios", count: 1 },
  ]).slice(1);

  expect(small?.percent).toBe(1);
});

test("draws a full bar for a single row", () => {
  expect(barRows([{ label: "linux", count: 3 }])).toEqual([
    { label: "linux", count: 3, percent: 100 },
  ]);
});

test("draws nothing without rows", () => {
  expect(barRows([])).toEqual([]);
});

test("tells a bar one short of the longest from the longest", () => {
  const [longest, nearly] = barRows([
    { label: "linux", count: 200 },
    { label: "ios", count: 199 },
  ]);

  expect(longest?.percent).toBe(100);
  expect(nearly?.percent).toBe(99.5);
});

test("rounds to the nearest tenth of a percent", () => {
  const [, third] = barRows([
    { label: "linux", count: 3 },
    { label: "ios", count: 1 },
  ]);

  expect(third?.percent).toBe(33.3);
});

test("draws no bar for a zero count", () => {
  expect(
    barRows([
      { label: "linux", count: 4 },
      { label: "ios", count: 0 },
    ]).map(({ percent }) => percent),
  ).toEqual([100, 0]);
});

test("draws no bars and no NaN when every count is zero", () => {
  expect(
    barRows([
      { label: "linux", count: 0 },
      { label: "ios", count: 0 },
    ]).map(({ percent }) => percent),
  ).toEqual([0, 0]);
});

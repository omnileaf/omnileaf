import { expect, test } from "vitest";

import { standInName, standInNumberFor } from "./stand-ins";

test("names a series by its stand-in number, with at least two digits", () => {
  expect(standInName("series", 4)).toBe("Series 04");
});

test("keeps every digit of a larger number", () => {
  expect(standInName("series", 1234)).toBe("Series 1234");
});

const SERIES_ID = "8f0e6c3a-2b7d-8c41-9a5e-3d1f0b7c2e64";
const PINNED_NUMBER = 949;
const LARGEST_STAND_IN_NUMBER = 999;
const SAMPLE_IDS = Array.from(
  { length: 100 },
  (_, index) =>
    `0190a3e4-0000-8000-8000-${String(index + 1).padStart(12, "0")}`,
);

test("gives the same id the same stand-in number every time", () => {
  expect(standInNumberFor(SERIES_ID)).toBe(standInNumberFor(SERIES_ID));
});

test("keeps every stand-in number between 1 and 999", () => {
  const numbers = SAMPLE_IDS.map(standInNumberFor);

  expect(numbers.every((number) => number >= 1)).toBe(true);
  expect(numbers.every((number) => number <= LARGEST_STAND_IN_NUMBER)).toBe(
    true,
  );
});

test("spreads ids that differ in one digit across the numbers", () => {
  const distinct = new Set(SAMPLE_IDS.map(standInNumberFor));

  expect(distinct.size).toBeGreaterThan(90);
});

test("pins one id's stand-in number so it holds across releases", () => {
  expect(standInNumberFor(SERIES_ID)).toBe(PINNED_NUMBER);
});

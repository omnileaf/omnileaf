import { expect, test } from "vitest";

import { missingVolumes, numberingOf, sectionsOf } from "./sample-numbers.ts";

test("merges the volumes missing up to the highest into runs", () => {
  const books = [3, 5, 9].map((number) =>
    numberingOf(`Volume ${String(number)}`),
  );

  expect(missingVolumes(books)).toEqual([
    { first: 1, last: 2 },
    { first: 4, last: 4 },
    { first: 6, last: 8 },
  ]);
});

test("lists the sections a series' books fall in, in reading order", () => {
  const books = ["Chapter 2", "Sketches", "Volume 1"].map(numberingOf);

  expect(sectionsOf(books)).toEqual(["volumes", "chapters"]);
});

import { expect, test } from "vitest";

import {
  isFiledInVolume,
  lastVolume,
  missingVolumes,
  numberingOf,
  sectionsOf,
} from "./sample-numbers.ts";

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

test("counts the books in each section a series' books fall in, in reading order", () => {
  const books = ["Chapter 2", "Sketches", "Volume 1", "Chapter 3"].map(
    numberingOf,
  );

  expect(sectionsOf(books)).toEqual([
    { section: "volumes", bookCount: 1 },
    { section: "chapters", bookCount: 2 },
  ]);
});

test("names the highest volume as the last one", () => {
  const books = ["Volume 3", "Volume 9", "Chapter 12", "Volume 5"].map(
    numberingOf,
  );

  expect(lastVolume(books)).toBe(9);
});

test("names no last volume in a series without volumes", () => {
  const books = ["Chapter 2", "Sketches"].map(numberingOf);

  expect(lastVolume(books)).toBeNull();
});

test("files a chapter in the volume it is read inside and no other book", () => {
  const chapter = { ...numberingOf("Chapter 2"), volume: 3 };
  const volumeBook = numberingOf("Volume 3");

  expect([
    isFiledInVolume(3, chapter),
    isFiledInVolume(4, chapter),
    isFiledInVolume(3, volumeBook),
    isFiledInVolume(null, volumeBook),
  ]).toEqual([true, false, false, true]);
});

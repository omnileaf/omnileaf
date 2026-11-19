import { expect, test } from "vitest";

import { seriesBooksHeading, volumeBooksHeading } from "./books-heading.ts";

test("heads a series' books with their count and how many are read", () => {
  const heading = seriesBooksHeading({
    bookCount: 12,
    readCount: 9,
    bookmarkCount: 0,
  });

  expect(heading).toEqual({ title: "12 books", line: "9 read" });
});

test("adds how many of a series' books are bookmarked once any are", () => {
  const heading = seriesBooksHeading({
    bookCount: 1,
    readCount: 0,
    bookmarkCount: 2,
  });

  expect(heading).toEqual({ title: "1 book", line: "0 read · 2 bookmarked" });
});

test("heads a volume's chapters with a note that they're in its folder", () => {
  const heading = volumeBooksHeading({
    bookCount: 8,
    readCount: 2,
    folder: "Volume 03",
  });

  expect(heading).toEqual({
    title: "8 chapters",
    line: "In this volume’s folder",
  });
});

test("heads with how many are read the chapters of a volume their file names number", () => {
  const heading = volumeBooksHeading({
    bookCount: 4,
    readCount: 1,
    folder: null,
  });

  expect(heading).toEqual({ title: "4 chapters", line: "1 read" });
});

import { expect, test } from "vitest";

import { seriesBooksHeading } from "./books-heading.ts";

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

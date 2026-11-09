import { expect, test } from "vitest";

import type { SeriesBook } from "#lib/ipc/bindings.ts";
import { chapter } from "#lib/series/book-fixture.ts";

import { chapterRuns } from "./chapter-runs";

function numbered(...numbers: readonly number[]): SeriesBook[] {
  return numbers.map((number) => chapter(number));
}

function shape(books: readonly SeriesBook[]) {
  return chapterRuns(books).map((row) =>
    row.kind === "run" ? { run: row.chapters ?? "others" } : row.book.position,
  );
}

test("heads each run of twelve chapters, newest first, with the chapters it holds", () => {
  const books = numbered(26, 25, 24, 13, 12, 1);

  expect(shape(books)).toEqual([
    { run: { first: 25, last: 26 } },
    26,
    25,
    { run: { first: 13, last: 24 } },
    24,
    13,
    { run: { first: 1, last: 12 } },
    12,
    1,
  ]);
});

test("ends a run on the last number a chapter covers", () => {
  const books = [chapter(11, { first: 11, last: 13 })];

  expect(shape(books)).toEqual([{ run: { first: 11, last: 13 } }, 11]);
});

test("puts the chapters with no number under a run of their own", () => {
  const books = [...numbered(1, 2), chapter(3, null), chapter(4, null)];

  expect(shape(books)).toEqual([
    { run: { first: 1, last: 2 } },
    1,
    2,
    { run: "others" },
    3,
    4,
  ]);
});

test("keys every row apart", () => {
  const rows = chapterRuns(numbered(1, 13, 25));

  expect(new Set(rows.map(({ key }) => key)).size).toBe(rows.length);
});

test("lists nothing for no chapters", () => {
  expect(chapterRuns([])).toEqual([]);
});

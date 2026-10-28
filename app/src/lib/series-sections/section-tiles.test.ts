import { expect, test } from "vitest";

import type { NumberRange, SeriesBook } from "#lib/ipc/bindings.ts";

import {
  booksOnly,
  type GapPlacing,
  type SectionTile,
  tileKey,
  withGaps,
} from "./section-tiles";

type BookId = SeriesBook["id"];

function book(name: string, shape: Partial<SeriesBook>): SeriesBook {
  return {
    id: name as BookId,
    position: 1,
    title: name,
    cover: null,
    addedAtMs: 0,
    reading: { state: "notStarted" },
    pageCount: null,
    isBookmarked: false,
    isNew: false,
    isFileMissing: false,
    kind: null,
    numbers: null,
    volume: null,
    section: "volumes",
    ...shape,
  };
}

function volume(first: number, last = first): SeriesBook {
  return book(`v${String(first)}`, {
    kind: "volume",
    numbers: { first, last },
  });
}

function chapterIn(volumeNumber: number, chapter: number): SeriesBook {
  return book(`v${String(volumeNumber)}c${String(chapter)}`, {
    kind: "chapter",
    numbers: { first: chapter, last: chapter },
    volume: volumeNumber,
  });
}

function shapeOf(tiles: readonly SectionTile[]): string[] {
  return tiles.map((tile) =>
    tile.kind === "book"
      ? tile.book.title
      : `gap ${String(tile.missing.first)}-${String(tile.missing.last)}`,
  );
}

const FIVE_TO_SIX: NumberRange = { first: 5, last: 6 };
const IN_ORDER: GapPlacing = {
  missing: [FIVE_TO_SIX],
  direction: "ascending",
  isComplete: true,
};

test("puts a gap where the missing volumes would sit", () => {
  const books = [volume(4), volume(7)];

  expect(shapeOf(withGaps(books, IN_ORDER))).toEqual(["v4", "gap 5-6", "v7"]);
});

test("puts the gap after the later volume when the last come first", () => {
  const books = [volume(7), volume(4)];

  const tiles = withGaps(books, { ...IN_ORDER, direction: "descending" });

  expect(shapeOf(tiles)).toEqual(["v7", "gap 5-6", "v4"]);
});

test("orders several gaps the way the volumes run", () => {
  const books = [volume(9), volume(7), volume(4), volume(1)];
  const missing = [
    { first: 2, last: 3 },
    { first: 5, last: 6 },
    { first: 8, last: 8 },
  ];

  const tiles = withGaps(books, {
    missing,
    direction: "descending",
    isComplete: true,
  });

  expect(shapeOf(tiles)).toEqual([
    "v9",
    "gap 8-8",
    "v7",
    "gap 5-6",
    "v4",
    "gap 2-3",
    "v1",
  ]);
});

test("places a range of volumes by its first", () => {
  const books = [volume(1, 4), volume(7)];

  expect(shapeOf(withGaps(books, IN_ORDER))).toEqual(["v1", "gap 5-6", "v7"]);
});

test("places a chapter by the volume it is read in", () => {
  const books = [chapterIn(4, 30), chapterIn(7, 61), chapterIn(7, 62)];

  expect(shapeOf(withGaps(books, IN_ORDER))).toEqual([
    "v4c30",
    "gap 5-6",
    "v7c61",
    "v7c62",
  ]);
});

test("puts a gap before chapters when no volume came before them", () => {
  const books = [chapterIn(3, 20)];

  const tiles = withGaps(books, {
    ...IN_ORDER,
    missing: [{ first: 1, last: 2 }],
  });

  expect(shapeOf(tiles)).toEqual(["gap 1-2", "v3c20"]);
});

test("keeps a decimal volume after the gap it sits inside", () => {
  const books = [volume(4), volume(5.5), volume(7)];

  expect(shapeOf(withGaps(books, IN_ORDER))).toEqual([
    "v4",
    "gap 5-6",
    "v5.5",
    "v7",
  ]);
});

test("keeps a decimal volume before the gap it sits inside when the last come first", () => {
  const books = [volume(7), volume(5.5), volume(4)];

  const tiles = withGaps(books, { ...IN_ORDER, direction: "descending" });

  expect(shapeOf(tiles)).toEqual(["v7", "v5.5", "gap 5-6", "v4"]);
});

test("places a chapter by the volume it is read in when the last come first", () => {
  const books = [chapterIn(7, 62), chapterIn(5, 40), chapterIn(4, 30)];

  const tiles = withGaps(books, { ...IN_ORDER, direction: "descending" });

  expect(shapeOf(tiles)).toEqual(["v7c62", "gap 5-6", "v5c40", "v4c30"]);
});

test("holds back a gap past the last book until the next page comes", () => {
  const books = [volume(1), volume(4)];

  const tiles = withGaps(books, { ...IN_ORDER, isComplete: false });

  expect(shapeOf(tiles)).toEqual(["v1", "v4"]);
});

test("ends with the gaps past the last book once every book has come", () => {
  const books = [volume(7), volume(4)];
  const missing = [{ first: 1, last: 3 }];

  const tiles = withGaps(books, {
    missing,
    direction: "descending",
    isComplete: true,
  });

  expect(shapeOf(tiles)).toEqual(["v7", "v4", "gap 1-3"]);
});

test("puts the gap below a decimal last volume between it and the volume before", () => {
  const books = [volume(6), volume(9.5)];

  const tiles = withGaps(books, {
    ...IN_ORDER,
    missing: [{ first: 7, last: 9 }],
  });

  expect(shapeOf(tiles)).toEqual(["v6", "gap 7-9", "v9.5"]);
});

test("puts the gap below a decimal last volume after it when the last come first", () => {
  const books = [volume(9.5), volume(6)];

  const tiles = withGaps(books, {
    missing: [{ first: 7, last: 9 }],
    direction: "descending",
    isComplete: true,
  });

  expect(shapeOf(tiles)).toEqual(["v9.5", "gap 7-9", "v6"]);
});

const BELOW_A_LONE_DECIMAL: GapPlacing = {
  missing: [{ first: 1, last: 2 }],
  direction: "ascending",
  isComplete: true,
};

test("puts the gap before a lone decimal volume", () => {
  const tiles = withGaps([volume(2.5)], BELOW_A_LONE_DECIMAL);

  expect(shapeOf(tiles)).toEqual(["gap 1-2", "v2.5"]);
});

test("ends with the gap below a lone decimal volume when the last come first", () => {
  const tiles = withGaps([volume(2.5)], {
    ...BELOW_A_LONE_DECIMAL,
    direction: "descending",
  });

  expect(shapeOf(tiles)).toEqual(["v2.5", "gap 1-2"]);
});

test("holds back the gap below a lone decimal volume until every book has come", () => {
  const tiles = withGaps([volume(2.5)], {
    ...BELOW_A_LONE_DECIMAL,
    direction: "descending",
    isComplete: false,
  });

  expect(shapeOf(tiles)).toEqual(["v2.5"]);
});

test("gives books only when nothing is missing", () => {
  const books = [volume(1), volume(2)];

  expect(withGaps(books, { ...IN_ORDER, missing: [] })).toEqual(
    booksOnly(books),
  );
});

test("lists each book as a tile in the order it came", () => {
  const books = [volume(2), volume(1)];

  expect(shapeOf(booksOnly(books))).toEqual(["v2", "v1"]);
});

test("keys a book by its id and a gap by its first missing volume", () => {
  const tiles = withGaps([volume(4), volume(7)], IN_ORDER);

  expect(tiles.map(tileKey)).toEqual(["v4", "gap-5", "v7"]);
});

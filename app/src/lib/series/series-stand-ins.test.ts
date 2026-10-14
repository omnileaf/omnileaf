import { expect, test } from "vitest";

import type { HistoryEntry, OpenedBook } from "#lib/ipc/bindings.ts";
import type { CoverPath } from "#lib/library/cover-url.ts";
import { standInLook } from "#lib/library/series-look.ts";
import { bookIdIn } from "#lib/reader/opened-book.ts";
import type { SeriesId } from "#lib/series/series-id.ts";
import {
  standInHistoryEntry,
  standInOpenedBook,
} from "#lib/series/series-stand-ins.ts";

const SERIES = "0190a3e4-0000-8000-8000-0000000000a1" as SeriesId;

function readEntry(): HistoryEntry {
  const book = bookIdIn("0190a3e4-0000-8000-8000-0000000000b1");
  if (book === undefined) {
    throw new Error("a sample book needs an id's shape");
  }
  return {
    book,
    bookTitle: "Hidden Story v04",
    series: SERIES,
    seriesTitle: "Hidden Story",
    position: 4,
    cover: null,
    startedAtMs: 1_790_000_000_000,
    utcOffsetMinutes: 600,
    readSeconds: 90,
    readTo: { state: "page", page: 7, pageCount: 24 },
    reading: { state: "started", page: 7 },
    day: { day: 20_717, readSeconds: 600 },
  };
}

test("names a history entry's series as the library does and its book by its place in the series", () => {
  const entry = readEntry();

  const standIn = standInHistoryEntry(entry);

  const series = standInLook({ id: SERIES, title: "", cover: null }).title;
  expect([standIn.seriesTitle, standIn.bookTitle]).toEqual([
    series,
    `${series} · Book 4`,
  ]);
});

test("keeps where, when and how long a history entry was read", () => {
  const entry = readEntry();

  const standIn = standInHistoryEntry(entry);

  expect({ ...standIn, seriesTitle: "", bookTitle: "" }).toEqual({
    ...entry,
    seriesTitle: "",
    bookTitle: "",
  });
});

test("shows no cover for the books either side of a book opened in Screenshot mode", () => {
  const next = bookIdIn("0190a3e4-0000-8000-8000-0000000000b2");
  const cover =
    "thumb/v1/0190a3e4-0000-8000-8000-0000000000b2/1/1" as CoverPath;
  if (next === undefined) {
    throw new Error("a sample book needs an id's shape");
  }
  const book: OpenedBook = {
    id: next,
    title: "Hidden Story v04",
    series: SERIES,
    seriesTitle: "Hidden Story",
    pages: [],
    startPage: 0,
    reading: { state: "notStarted" },
    position: 4,
    previous: null,
    next: {
      id: next,
      title: "Hidden Story v05",
      cover,
      reading: { state: "notStarted" },
    },
  };

  const standIn = standInOpenedBook(book);

  expect(standIn.next?.cover).toBeNull();
});

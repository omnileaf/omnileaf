import { expect, test } from "vitest";

import type { HistoryEntry } from "#lib/ipc/bindings.ts";
import { standInLook } from "#lib/library/series-look.ts";
import { bookIdIn } from "#lib/reader/opened-book.ts";
import type { SeriesId } from "#lib/series/series-id.ts";
import { standInHistoryEntry } from "#lib/series/series-stand-ins.ts";

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

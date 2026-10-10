import { expect, test } from "vitest";

import { historyDays } from "#lib/history/history-days.ts";
import type { HistoryEntry } from "#lib/ipc/bindings.ts";
import { bookIdIn } from "#lib/reader/opened-book.ts";
import type { SeriesId } from "#lib/series/series-id.ts";

const FIRST = "0190a3e4-0000-8000-8000-0000000000b1";
const SECOND = "0190a3e4-0000-8000-8000-0000000000b2";
const THIRD = "0190a3e4-0000-8000-8000-0000000000b3";

const DAY_MS = 86_400_000;
const NOON_MS = DAY_MS / 2;
const MONDAY = 20_731;
const SERIES = "0190a3e4-0000-8000-8000-0000000000a1" as SeriesId;

function entry(
  book: string,
  day: number,
  dayReadSeconds: number,
): HistoryEntry {
  const id = bookIdIn(book);
  if (id === undefined) {
    throw new Error("a sample book needs an id's shape");
  }
  return {
    book: id,
    bookTitle: "Sample Series 01 v01",
    series: SERIES,
    seriesTitle: "Sample Series 01",
    position: 1,
    cover: null,
    startedAtMs: day * DAY_MS + NOON_MS,
    utcOffsetMinutes: 0,
    readSeconds: 60,
    readTo: { state: "page", page: 2, pageCount: 24 },
    reading: { state: "started", page: 2 },
    day: { day, readSeconds: dayReadSeconds },
  };
}

test("has no days without sessions", () => {
  const days = historyDays([]);

  expect(days).toEqual([]);
});

test("gathers the sessions of each day in the order they are listed", () => {
  const listed = [
    entry(THIRD, MONDAY, 900),
    entry(SECOND, MONDAY, 900),
    entry(FIRST, MONDAY - 2, 300),
  ];

  const days = historyDays(listed);

  expect(
    days.map((day) => [
      day.day,
      day.readSeconds,
      day.entries.map((one) => one.book),
    ]),
  ).toEqual([
    [MONDAY, 900, [THIRD, SECOND]],
    [MONDAY - 2, 300, [FIRST]],
  ]);
});

test("keeps a day apart from a later run of the same day, as sessions read in other zones list them", () => {
  const listed = [
    entry(THIRD, MONDAY, 900),
    entry(SECOND, MONDAY - 1, 600),
    entry(FIRST, MONDAY, 900),
  ];

  const days = historyDays(listed);

  expect(days.map((day) => day.day)).toEqual([MONDAY, MONDAY - 1, MONDAY]);
});

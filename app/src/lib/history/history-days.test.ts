import { expect, test } from "vitest";

import {
  type HistoryCalendar,
  type HistoryDay,
  historyDays,
  lastWeekDays,
} from "#lib/history/history-days.ts";
import type { HistoryEntry } from "#lib/ipc/bindings.ts";
import { bookIdIn } from "#lib/reader/opened-book.ts";
import type { SeriesId } from "#lib/series/series-id.ts";

const FIRST = "0190a3e4-0000-8000-8000-0000000000b1";
const SECOND = "0190a3e4-0000-8000-8000-0000000000b2";
const THIRD = "0190a3e4-0000-8000-8000-0000000000b3";

const DAY_MS = 86_400_000;
const NOON_MS = DAY_MS / 2;
const MONDAY = 20_731;
const WEDNESDAY = MONDAY + 2;
const ON_MONDAY: HistoryCalendar = { today: MONDAY, weekStart: MONDAY };
const ON_WEDNESDAY: HistoryCalendar = { today: WEDNESDAY, weekStart: MONDAY };

function summed(days: readonly HistoryDay[]): unknown[] {
  return days.map((day) => [
    day.title,
    day.readSeconds,
    day.entries.map((one) => one.book),
  ]);
}
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
  const days = historyDays([], ON_MONDAY);

  expect(days).toEqual([]);
});

test("gathers the sessions of each day in the order they are listed", () => {
  const listed = [
    entry(THIRD, MONDAY, 900),
    entry(SECOND, MONDAY, 900),
    entry(FIRST, MONDAY - 14, 300),
  ];

  const days = historyDays(listed, ON_MONDAY);

  expect(summed(days)).toEqual([
    [{ kind: "day", day: MONDAY }, 900, [THIRD, SECOND]],
    [{ kind: "day", day: MONDAY - 14 }, 300, [FIRST]],
  ]);
});

test("keeps a day apart from a later run of the same day, as sessions read in other zones list them", () => {
  const listed = [
    entry(THIRD, MONDAY, 900),
    entry(SECOND, MONDAY - 1, 600),
    entry(FIRST, MONDAY, 900),
  ];

  const days = historyDays(listed, ON_MONDAY);

  expect(days.map((day) => day.title)).toEqual([
    { kind: "day", day: MONDAY },
    { kind: "day", day: MONDAY - 1 },
    { kind: "day", day: MONDAY },
  ]);
});

test("gathers the days of the week before this one into last week, adding up the time read on each", () => {
  const listed = [
    entry(THIRD, MONDAY, 900),
    entry(SECOND, MONDAY - 2, 600),
    entry(FIRST, MONDAY - 2, 600),
    entry(FIRST, MONDAY - 7, 300),
    entry(SECOND, MONDAY - 8, 120),
  ];

  const days = historyDays(listed, ON_WEDNESDAY);

  expect(summed(days)).toEqual([
    [{ kind: "day", day: MONDAY }, 900, [THIRD]],
    [{ kind: "lastWeek" }, 900, [SECOND, FIRST, FIRST]],
    [{ kind: "day", day: MONDAY - 8 }, 120, [SECOND]],
  ]);
});

test("keeps yesterday a day of its own when this week starts today", () => {
  const listed = [
    entry(THIRD, MONDAY - 1, 600),
    entry(SECOND, MONDAY - 3, 300),
  ];

  const days = historyDays(listed, ON_MONDAY);

  expect(summed(days)).toEqual([
    [{ kind: "day", day: MONDAY - 1 }, 600, [THIRD]],
    [{ kind: "lastWeek" }, 300, [SECOND]],
  ]);
});

test("takes last week's time read from the time counted over its days when given, as a day read only in a book since removed lists no session", () => {
  const listed = [
    entry(THIRD, MONDAY, 900),
    entry(SECOND, MONDAY - 2, 600),
    entry(FIRST, MONDAY - 7, 300),
  ];

  const days = historyDays(listed, ON_WEDNESDAY, 1_500);

  expect(summed(days)).toEqual([
    [{ kind: "day", day: MONDAY }, 900, [THIRD]],
    [{ kind: "lastWeek" }, 1_500, [SECOND, FIRST]],
  ]);
});

test("gathers the seven days before this week into last week, leaving out yesterday", () => {
  const gathered = [ON_WEDNESDAY, ON_MONDAY].map(lastWeekDays);

  expect(gathered).toEqual([
    { first: MONDAY - 7, last: MONDAY - 1 },
    { first: MONDAY - 7, last: MONDAY - 2 },
  ]);
});

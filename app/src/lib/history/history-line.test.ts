import { expect, test } from "vitest";

import type { HistoryEntry } from "#lib/ipc/bindings.ts";

import { historyLine, whenFormats } from "./history-line.ts";

const FORMATS = whenFormats("en-US", "h23");

function entry(readTo: HistoryEntry["readTo"]): HistoryEntry {
  return {
    bookTitle: "Volume 3",
    startedAtMs: Date.UTC(2026, 9, 5, 21, 40),
    utcOffsetMinutes: 0,
    readTo,
  } as HistoryEntry;
}

const ON_PAGE_14 = { state: "page", page: 14, pageCount: 192 } as const;

test("says the book, the page reached and the time it was read today", () => {
  expect(historyLine(entry(ON_PAGE_14), "today", FORMATS)).toBe(
    "Volume 3 · page 14 of 192 · 21:40",
  );
});

test("says a finished book is finished", () => {
  expect(historyLine(entry({ state: "end" }), "yesterday", FORMATS)).toBe(
    "Volume 3 · finished · 21:40",
  );
});

test("names the weekday this week and the date before it", () => {
  expect([
    historyLine(entry(ON_PAGE_14), "thisWeek", FORMATS),
    historyLine(entry(ON_PAGE_14), "earlier", FORMATS),
  ]).toEqual([
    "Volume 3 · page 14 of 192 · Monday",
    "Volume 3 · page 14 of 192 · Oct 5",
  ]);
});

test("reads the time on the clock the book was read by", () => {
  const abroad = { ...entry(ON_PAGE_14), utcOffsetMinutes: 600 };

  expect(historyLine(abroad, "today", FORMATS)).toBe(
    "Volume 3 · page 14 of 192 · 07:40",
  );
});

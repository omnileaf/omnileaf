import { expect, test } from "vitest";

import type { HistoryCalendar } from "#lib/history/history-days.ts";
import { type WeekReads, WeekTotals } from "#lib/history/week-totals.svelte.ts";

const MONDAY = 20_731;
const ON_MONDAY: HistoryCalendar = { today: MONDAY, weekStart: MONDAY };
const NEXT_MONDAY: HistoryCalendar = {
  today: MONDAY + 7,
  weekStart: MONDAY + 7,
};

type WeekAnswer = Awaited<ReturnType<WeekReads["week"]>>;
type SecondsAnswer = Awaited<ReturnType<WeekReads["between"]>>;

function week(readSeconds: number): WeekAnswer {
  return {
    status: "ok",
    data: { readSeconds, booksOpened: 1, booksFinished: 0, daysInARow: 1 },
  };
}

function seconds(read: number): SecondsAnswer {
  return { status: "ok", data: read };
}

function heldReads(): {
  readonly reads: WeekReads;
  readonly weeksOwed: ((answer: WeekAnswer) => void)[];
  readonly secondsOwed: ((answer: SecondsAnswer) => void)[];
} {
  const weeksOwed: ((answer: WeekAnswer) => void)[] = [];
  const secondsOwed: ((answer: SecondsAnswer) => void)[] = [];
  return {
    reads: {
      week: () =>
        new Promise((resolve) => {
          weeksOwed.push(resolve);
        }),
      between: () =>
        new Promise((resolve) => {
          secondsOwed.push(resolve);
        }),
    },
    weeksOwed,
    secondsOwed,
  };
}

test("keeps the totals the latest read answers with, whatever order the reads answer in", async () => {
  const { reads, weeksOwed, secondsOwed } = heldReads();
  const totals = new WeekTotals(reads, () => {});
  const earlier = totals.read(ON_MONDAY);
  const later = totals.read(NEXT_MONDAY);
  const [earlierThisWeek, laterThisWeek] = weeksOwed;
  const [earlierLastWeek, laterLastWeek] = secondsOwed;

  laterThisWeek?.(week(60));
  laterLastWeek?.(seconds(120));
  await later;
  earlierThisWeek?.(week(600));
  earlierLastWeek?.(seconds(1200));
  await earlier;

  expect([totals.thisWeek?.readSeconds, totals.lastWeekSeconds]).toEqual([
    60, 120,
  ]);
});

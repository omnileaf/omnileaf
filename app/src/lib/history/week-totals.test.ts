import { expect, test } from "vitest";

import type { HistoryCalendar } from "#lib/history/history-days.ts";
import { type WeekReads, WeekTotals } from "#lib/history/week-totals.svelte.ts";

const MONDAY = 20_731;
const ON_MONDAY: HistoryCalendar = { today: MONDAY, weekStart: MONDAY };
const NEXT_MONDAY: HistoryCalendar = {
  today: MONDAY + 7,
  weekStart: MONDAY + 7,
};

type Answer = Awaited<ReturnType<WeekReads["since"]>>;

function seconds(read: number): Answer {
  return { status: "ok", data: read };
}

function heldReads(): {
  readonly reads: WeekReads;
  readonly owed: ((answer: Answer) => void)[];
} {
  const owed: ((answer: Answer) => void)[] = [];
  const held = () =>
    new Promise<Answer>((resolve) => {
      owed.push(resolve);
    });
  return { reads: { since: held, between: held }, owed };
}

test("keeps the totals the latest read answers with, whatever order the reads answer in", async () => {
  const { reads, owed } = heldReads();
  const totals = new WeekTotals(reads, () => {});
  const earlier = totals.read(ON_MONDAY);
  const later = totals.read(NEXT_MONDAY);
  const [earlierThisWeek, earlierLastWeek, laterThisWeek, laterLastWeek] = owed;

  laterThisWeek?.(seconds(60));
  laterLastWeek?.(seconds(120));
  await later;
  earlierThisWeek?.(seconds(600));
  earlierLastWeek?.(seconds(1200));
  await earlier;

  expect([totals.thisWeekSeconds, totals.lastWeekSeconds]).toEqual([60, 120]);
});

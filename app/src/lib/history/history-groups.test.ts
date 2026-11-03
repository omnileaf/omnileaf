import { expect, test } from "vitest";

import type { HistoryEntry } from "#lib/ipc/bindings.ts";

import { groupSeconds, historyGroups } from "./history-groups.ts";

const THURSDAY = 20_369;
const MONDAY = THURSDAY - 3;
const CALENDAR = { today: THURSDAY, weekStart: MONDAY };

function readOn(day: number, book: string): HistoryEntry {
  return { book, day: { day, readSeconds: 60 } } as HistoryEntry;
}

test("puts each book under Today, Yesterday, This week or Earlier, in the order read", () => {
  const groups = historyGroups(
    [
      readOn(THURSDAY, "a"),
      readOn(THURSDAY - 1, "b"),
      readOn(MONDAY, "c"),
      readOn(MONDAY - 1, "d"),
      readOn(MONDAY - 9, "e"),
    ],
    CALENDAR,
  );

  expect(
    groups.map(({ name, entries }) => [name, entries.map(({ book }) => book)]),
  ).toEqual([
    ["today", ["a"]],
    ["yesterday", ["b"]],
    ["thisWeek", ["c"]],
    ["earlier", ["d", "e"]],
  ]);
});

test("leaves out a group with nothing read in it", () => {
  const groups = historyGroups(
    [readOn(THURSDAY, "a"), readOn(MONDAY - 1, "d")],
    CALENDAR,
  );

  expect(groups.map(({ name }) => name)).toEqual(["today", "earlier"]);
});

test("keeps yesterday on its own when the week starts today", () => {
  const groups = historyGroups([readOn(MONDAY - 1, "b")], {
    today: MONDAY,
    weekStart: MONDAY,
  });

  expect(groups.map(({ name }) => name)).toEqual(["yesterday"]);
});

test("totals a group's time once per day, not once per book read that day", () => {
  const [group] = historyGroups(
    [
      { book: "a", day: { day: MONDAY, readSeconds: 600 } },
      { book: "b", day: { day: MONDAY, readSeconds: 600 } },
      { book: "c", day: { day: MONDAY + 1, readSeconds: 300 } },
    ] as HistoryEntry[],
    CALENDAR,
  );

  expect(group === undefined ? 0 : groupSeconds(group)).toBe(900);
});

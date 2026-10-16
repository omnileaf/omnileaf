import { expect, test } from "vitest";

import { dayFormats, dayName } from "#lib/history/day-name.ts";
import type { HistoryCalendar } from "#lib/history/history-groups.ts";

const MONDAY = 20_731;
const FORMATS = dayFormats("en-US");
const ON_MONDAY: HistoryCalendar = { today: MONDAY, weekStart: MONDAY };
const ON_THURSDAY: HistoryCalendar = { today: MONDAY + 3, weekStart: MONDAY };

function named(daysAgo: number): string {
  return dayName(MONDAY - daysAgo, ON_MONDAY, FORMATS);
}

test("calls today and the day before by name", () => {
  const names = [named(0), named(1)];

  expect(names).toEqual(["Today", "Yesterday"]);
});

test("calls the other days of this week by their weekday", () => {
  const names = [MONDAY, MONDAY + 1].map((day) =>
    dayName(day, ON_THURSDAY, FORMATS),
  );

  expect(names).toEqual(["Monday", "Tuesday"]);
});

test("gives a day before this week its date", () => {
  const names = [named(2), named(7), named(264)];

  expect(names).toEqual([
    "Saturday, October 3",
    "Monday, September 28",
    "Wednesday, January 14",
  ]);
});

test("gives the year of a day in another year", () => {
  const name = named(279);

  expect(name).toBe("Tuesday, December 30, 2025");
});

test("gives the date of a day after today, which only a clock set back reaches", () => {
  const name = named(-1);

  expect(name).toBe("Tuesday, October 6");
});

test("writes the date the way the locale does", () => {
  const name = dayName(MONDAY - 7, ON_MONDAY, dayFormats("en-GB"));

  expect(name).toBe("Monday 28 September");
});

import { expect, test } from "vitest";

import { dayName } from "#lib/history/day-name.ts";

const MONDAY = 20_731;
const LOCALE = "en-US";

function named(daysAgo: number): string {
  return dayName(MONDAY - daysAgo, MONDAY, LOCALE);
}

test("calls today and the day before by name", () => {
  const names = [named(0), named(1)];

  expect(names).toEqual(["Today", "Yesterday"]);
});

test("calls the other days of the week before by their weekday", () => {
  const names = [named(2), named(6)];

  expect(names).toEqual(["Saturday", "Tuesday"]);
});

test("gives a day a week or more before its date", () => {
  const names = [named(7), named(264)];

  expect(names).toEqual(["Monday, September 28", "Wednesday, January 14"]);
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
  const name = dayName(MONDAY - 7, MONDAY, "en-GB");

  expect(name).toBe("Monday 28 September");
});

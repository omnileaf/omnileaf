import { expect, test } from "vitest";

import {
  firstDayOfWeek,
  localDayOf,
  weekStartOf,
} from "#lib/history/local-date.ts";

const MONDAY = 1;
const SUNDAY = 7;
const MONDAY_5_OCTOBER_2026 = 20_731;

test("counts the device's day at a moment from 1970-01-01, however late in the day", () => {
  const days = [
    localDayOf(new Date(1970, 0, 1, 0, 0)),
    localDayOf(new Date(2026, 9, 5, 0, 1)),
    localDayOf(new Date(2026, 9, 5, 23, 59)),
    localDayOf(new Date(1969, 11, 31, 12, 0)),
  ];

  expect(days).toEqual([0, MONDAY_5_OCTOBER_2026, MONDAY_5_OCTOBER_2026, -1]);
});

test("starts a week on its first day, going back to it from any day of the week", () => {
  const starts = [
    weekStartOf(MONDAY_5_OCTOBER_2026, MONDAY),
    weekStartOf(MONDAY_5_OCTOBER_2026 + 6, MONDAY),
    weekStartOf(MONDAY_5_OCTOBER_2026 + 2, SUNDAY),
    weekStartOf(MONDAY_5_OCTOBER_2026 - 1, SUNDAY),
    weekStartOf(0, MONDAY),
    weekStartOf(-1, MONDAY),
  ];

  expect(starts).toEqual([
    MONDAY_5_OCTOBER_2026,
    MONDAY_5_OCTOBER_2026,
    MONDAY_5_OCTOBER_2026 - 1,
    MONDAY_5_OCTOBER_2026 - 1,
    -3,
    -3,
  ]);
});

test("starts a week where the locale does", () => {
  const firstDays = ["en-GB", "de-DE", "en-US"].map((tag) =>
    firstDayOfWeek(new Intl.Locale(tag)),
  );

  expect(firstDays).toEqual([MONDAY, MONDAY, SUNDAY]);
});

test("reads the first day of the week from the getter older WebKit offers", () => {
  const firstDay = firstDayOfWeek({ weekInfo: { firstDay: SUNDAY } });

  expect(firstDay).toBe(SUNDAY);
});

test("starts a week on Monday where the browser can't tell its first day", () => {
  const firstDay = firstDayOfWeek({});

  expect(firstDay).toBe(MONDAY);
});

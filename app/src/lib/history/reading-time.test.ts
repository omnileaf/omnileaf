import { expect, test } from "vitest";

import { readingTime } from "#lib/history/reading-time.ts";

const MINUTE = 60;
const HOUR = 60 * MINUTE;

test("says under a minute was read for less than a minute", () => {
  const times = [0, 59].map(readingTime);

  expect(times).toEqual(["under 1 min", "under 1 min"]);
});

test("counts whole minutes read under an hour", () => {
  const times = [MINUTE, 52 * MINUTE + 59].map(readingTime);

  expect(times).toEqual(["1 min", "52 min"]);
});

test("counts hours and the minutes past them", () => {
  const times = [HOUR, HOUR + 10 * MINUTE, 3 * HOUR + 12 * MINUTE].map(
    readingTime,
  );

  expect(times).toEqual(["1 h", "1 h 10 min", "3 h 12 min"]);
});

test("groups the digits of many hours", () => {
  const time = readingTime(1_234 * HOUR);

  expect(time).toBe("1,234 h");
});

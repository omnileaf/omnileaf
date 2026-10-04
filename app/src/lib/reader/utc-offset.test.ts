import { expect, test } from "vitest";

import { utcOffsetMinutes } from "#lib/reader/utc-offset.ts";

function zoneBehindUtcBy(minutes: number): Pick<Date, "getTimezoneOffset"> {
  return { getTimezoneOffset: () => minutes };
}

test("counts a zone ahead of UTC as a positive number of minutes", () => {
  const offset = utcOffsetMinutes(zoneBehindUtcBy(-600));

  expect(offset).toBe(600);
});

test("counts a zone behind UTC as a negative number of minutes", () => {
  const offset = utcOffsetMinutes(zoneBehindUtcBy(300));

  expect(offset).toBe(-300);
});

test("rounds an offset of part of a minute to whole minutes", () => {
  const offset = utcOffsetMinutes(zoneBehindUtcBy(-17.5));

  expect(offset).toBe(18);
});

test("counts UTC itself as no offset", () => {
  const offset = utcOffsetMinutes(new Date());

  expect(Object.is(offset, 0)).toBe(true);
});

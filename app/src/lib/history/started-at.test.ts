import { expect, test } from "vitest";

import { startedAtTime } from "#lib/history/started-at.ts";

const STARTED_AT_MS = 1_790_000_000_000;

test("shows the time a session started at on the clock of the zone it was read in", () => {
  const times = [600, -300, 0].map((utcOffsetMinutes) =>
    startedAtTime({ startedAtMs: STARTED_AT_MS, utcOffsetMinutes }, "en-US"),
  );

  expect(times).toEqual(["12:13 AM", "9:13 AM", "2:13 PM"]);
});

test("writes the time the way the locale does", () => {
  const time = startedAtTime(
    { startedAtMs: STARTED_AT_MS, utcOffsetMinutes: 600 },
    "en-GB",
  );

  expect(time).toBe("00:13");
});

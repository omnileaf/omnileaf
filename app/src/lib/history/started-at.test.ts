import { expect, test } from "vitest";

import { startedAtFormats, startedAtTime } from "#lib/history/started-at.ts";

const STARTED_AT_MS = 1_790_000_000_000;

test("shows the time a session started at on the clock of the zone it was read in", () => {
  const times = [600, -300, 0].map((utcOffsetMinutes) =>
    startedAtTime(
      { startedAtMs: STARTED_AT_MS, utcOffsetMinutes },
      startedAtFormats("en-US"),
    ),
  );

  expect(times).toEqual(["12:13 AM", "9:13 AM", "2:13 PM"]);
});

test("writes the time the way the locale does", () => {
  const time = startedAtTime(
    { startedAtMs: STARTED_AT_MS, utcOffsetMinutes: 600 },
    startedAtFormats("en-GB"),
  );

  expect(time).toBe("00:13");
});

test("writes the time on the clock chosen, whatever the locale's own", () => {
  const entry = { startedAtMs: STARTED_AT_MS, utcOffsetMinutes: 0 };

  const times = [
    startedAtTime(entry, startedAtFormats("en-GB", "h12")),
    startedAtTime(entry, startedAtFormats("en-US", "h23")),
  ];

  expect(times).toEqual(["02:13 pm", "14:13"]);
});

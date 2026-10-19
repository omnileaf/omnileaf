import { expect, test } from "vitest";

import { onThatClock, startedAtFormats } from "#lib/history/started-at.ts";

const STARTED_AT_MS = 1_790_000_000_000;

test("shows the time a session started at on the clock of the zone it was read in", () => {
  const { time } = startedAtFormats("en-US");

  const times = [600, -300, 0].map((utcOffsetMinutes) =>
    time.format(onThatClock({ startedAtMs: STARTED_AT_MS, utcOffsetMinutes })),
  );

  expect(times).toEqual(["12:13 AM", "9:13 AM", "2:13 PM"]);
});

test("writes the time the way the locale does", () => {
  const { time } = startedAtFormats("en-GB");

  const shown = time.format(
    onThatClock({ startedAtMs: STARTED_AT_MS, utcOffsetMinutes: 600 }),
  );

  expect(shown).toBe("00:13");
});

test("writes the time on the clock chosen, whatever the locale's own", () => {
  const at = onThatClock({ startedAtMs: STARTED_AT_MS, utcOffsetMinutes: 0 });

  const times = [
    startedAtFormats("en-GB", "h12").time.format(at),
    startedAtFormats("en-US", "h23").time.format(at),
  ];

  expect(times).toEqual(["02:13 pm", "14:13"]);
});

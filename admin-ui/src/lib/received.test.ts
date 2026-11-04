import { expect, test } from "vitest";

import { formatReceived } from "#lib/received.ts";

const BOARD_MOMENT = 1_740_828_300;

test("writes the moment as a date, a 24 hour time and the zone", () => {
  expect(formatReceived(BOARD_MOMENT).text).toBe("2025-03-01 11:25 UTC");
});

test("writes the moment as an ISO 8601 time in UTC for the datetime attribute", () => {
  expect(formatReceived(1_700_000_000).iso).toBe("2023-11-14T22:13:20.000Z");
});

test("pads a single digit month, day and hour", () => {
  expect(formatReceived(1_735_693_500).text).toBe("2025-01-01 01:05 UTC");
});

test("starts at the epoch", () => {
  expect(formatReceived(0).text).toBe("1970-01-01 00:00 UTC");
});

test("drops the seconds without rounding up to the next minute", () => {
  expect(formatReceived(BOARD_MOMENT + 59).text).toBe("2025-03-01 11:25 UTC");
  expect(formatReceived(BOARD_MOMENT + 60).text).toBe("2025-03-01 11:26 UTC");
});

test("rolls over midnight in UTC whatever the local zone", () => {
  expect(formatReceived(1_740_873_540).text).toBe("2025-03-01 23:59 UTC");
  expect(formatReceived(1_740_873_600).text).toBe("2025-03-02 00:00 UTC");
});

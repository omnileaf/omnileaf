import { expect, test } from "vitest";

const BOARD_MOMENT_MS = 1_740_828_300_000;
const KIRITIMATI_OFFSET_MINUTES = -840;

test("runs the unit tests in a zone fourteen hours ahead of UTC", () => {
  expect(new Date(BOARD_MOMENT_MS).getTimezoneOffset()).toBe(
    KIRITIMATI_OFFSET_MINUTES,
  );
});

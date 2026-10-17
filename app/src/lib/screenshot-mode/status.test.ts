import { expect, test } from "vitest";

import { screenshotModeSummary } from "./status";

test("sums it up as off in the Privacy list", () => {
  expect(screenshotModeSummary({ kind: "off" })).toBe("Off");
});

test("sums it up as on while there's no hour limit", () => {
  expect(screenshotModeSummary({ kind: "on" })).toBe("On");
});

test("sums it up with the time it turns off, in the chosen hour cycle", () => {
  const turnsOffAt = Date.UTC(2026, 9, 3, 22, 14);

  expect(screenshotModeSummary({ kind: "onUntil", turnsOffAt }, "h23")).toBe(
    "On until 22:14",
  );
});

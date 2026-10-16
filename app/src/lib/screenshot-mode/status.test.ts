import { expect, test } from "vitest";

import { screenshotModeStatus, screenshotModeSummary } from "./status";

test("invites turning it on while off", () => {
  expect(screenshotModeStatus({ kind: "off" })).toBe(
    "Swap names and covers for stand-ins before you share a screenshot or a report.",
  );
});

test("says it stays on while there's no hour limit", () => {
  expect(screenshotModeStatus({ kind: "on" })).toBe("On until you turn it off");
});

test("says when it turns off in the local time of day", () => {
  const turnsOffAt = Date.UTC(2026, 9, 3, 22, 14);

  expect(screenshotModeStatus({ kind: "onUntil", turnsOffAt })).toBe(
    "On · turns off at 10:14 PM",
  );
});

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

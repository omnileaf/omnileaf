import { expect, test } from "vitest";

import { isBusy, statusText, type MoveState } from "#lib/move-state.ts";

const STATES = [
  [{ kind: "idle" }, false, ""],
  [{ kind: "issueInvalid", message: "Enter a number" }, false, ""],
  [
    { kind: "confirming", request: { status: "published", issue: 4 } },
    false,
    "",
  ],
  [{ kind: "pending" }, true, "Moving this report."],
  [{ kind: "reloading" }, true, "Loading this report again."],
  [
    {
      kind: "problem",
      message: "x",
      recoveries: ["retry"],
      request: { status: "closed" },
    },
    false,
    "",
  ],
  [
    { kind: "moved", announcement: "Moved to Closed." },
    false,
    "Moved to Closed.",
  ],
] as const satisfies readonly (readonly [MoveState, boolean, string])[];

test.each(STATES)("tells whether %j is busy", (state, busy) => {
  expect(isBusy(state)).toBe(busy);
});

test.each(STATES)("words the status of %j", (state, _busy, words) => {
  expect(statusText(state)).toBe(words);
});

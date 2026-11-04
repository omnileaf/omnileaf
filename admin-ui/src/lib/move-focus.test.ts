import { expect, test, vi } from "vitest";

import { MoveFocusTracker, focusAfter } from "#lib/move-focus.ts";
import type { MoveState } from "#lib/move-state.ts";

const IDLE: MoveState = { kind: "idle" };
const PENDING: MoveState = { kind: "pending" };
const RELOADING: MoveState = { kind: "reloading" };
const MOVED: MoveState = { kind: "moved", announcement: "Moved to Closed." };
const CONFIRMING: MoveState = {
  kind: "confirming",
  request: { status: "duplicate", issue: 9 },
};
const PROBLEM: MoveState = {
  kind: "problem",
  message: "x",
  recoveries: ["retry"],
  request: { status: "closed" },
};
const INVALID: MoveState = { kind: "issueInvalid", message: "Enter a number" };
const STATUS = { kind: "element", id: "move-status" };

test("moves to the question when a move asks for confirmation", () => {
  expect(focusAfter(IDLE, CONFIRMING)).toEqual({
    kind: "element",
    id: "move-confirm-question",
  });
});

test("returns to the button that was pressed when the confirmation is cancelled", () => {
  expect(focusAfter(CONFIRMING, IDLE)).toEqual({
    kind: "element",
    id: "move-duplicate",
  });
});

test.each([IDLE, PENDING, CONFIRMING])(
  "moves to the issue field when it needs a number, coming from %j",
  (from) => {
    expect(focusAfter(from, INVALID)).toEqual({
      kind: "element",
      id: "move-issue",
    });
  },
);

test.each([IDLE, CONFIRMING, PROBLEM])(
  "moves to the status text that stays in the card while a move is sent, coming from %j",
  (from) => {
    expect(focusAfter(from, PENDING)).toEqual(STATUS);
  },
);

test("moves to the same status text while the report is reloaded", () => {
  expect(focusAfter(PROBLEM, RELOADING)).toEqual(STATUS);
});

test("stays on the status text once the report has moved so its words are read out", () => {
  expect(focusAfter(PENDING, MOVED)).toEqual(STATUS);
});

test("moves to the page heading once the report was reloaded", () => {
  expect(focusAfter(RELOADING, IDLE)).toEqual({ kind: "heading" });
});

test("moves to the problem alert when a move fails", () => {
  expect(focusAfter(PENDING, PROBLEM)).toEqual({
    kind: "element",
    id: "move-problem",
  });
});

test("keeps focus where it is going from idle to idle", () => {
  expect(focusAfter(IDLE, IDLE)).toBeUndefined();
});

function tracker() {
  const steps: string[] = [];
  const focus = vi.fn((target: object) => {
    steps.push(`focus ${JSON.stringify(target)}`);
  });
  const settle = vi.fn(() => {
    steps.push("settle");
    return Promise.resolve();
  });
  return { tracker: new MoveFocusTracker(focus, settle), focus, settle, steps };
}

test("waits for the page to settle before it moves focus", async () => {
  const { tracker: tracked, steps } = tracker();

  await tracked.observe(CONFIRMING);

  expect(steps).toEqual([
    "settle",
    'focus {"kind":"element","id":"move-confirm-question"}',
  ]);
});

test("remembers the state it saw last to know where focus came from", async () => {
  const { tracker: tracked, focus } = tracker();
  await tracked.observe(CONFIRMING);

  await tracked.observe(IDLE);

  expect(focus).toHaveBeenLastCalledWith({
    kind: "element",
    id: "move-duplicate",
  });
});

test("starts out knowing the card is idle and leaves focus alone for it", async () => {
  const { tracker: tracked, focus, settle } = tracker();

  await tracked.observe(IDLE);

  expect(focus).not.toHaveBeenCalled();
  expect(settle).not.toHaveBeenCalled();
});

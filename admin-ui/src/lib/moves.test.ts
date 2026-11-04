import { expect, test } from "vitest";

import {
  allowedMoves,
  parseIssueNumber,
  planMove,
  statusOf,
} from "#lib/moves.ts";
import {
  STATUS_KINDS,
  type MoveRequest,
  type MoveTarget,
  type Status,
  type StatusKind,
} from "#lib/wire.ts";

const ALLOWED = {
  received: ["reviewing", "published", "duplicate", "closed"],
  reviewing: ["published", "duplicate", "closed"],
  published: [],
  duplicate: [],
  closed: ["reviewing"],
} as const satisfies Record<StatusKind, readonly MoveTarget[]>;

test.each(STATUS_KINDS)("lists the moves a %s report can make", (from) => {
  expect(allowedMoves(from)).toEqual(ALLOWED[from]);
});

test.each([
  ["412", 412],
  ["  7  ", 7],
  ["#412", 412],
  ["007", 7],
  ["9007199254740991", Number.MAX_SAFE_INTEGER],
])("reads %j as issue %d", (text, issue) => {
  expect(parseIssueNumber(text)).toBe(issue);
});

test.each([
  "",
  "   ",
  "#",
  "0",
  "-3",
  "+5",
  "4.5",
  "12abc",
  "one",
  "1e3",
  "9007199254740992",
  "##4",
])("refuses %j as an issue number", (text) => {
  expect(parseIssueNumber(text)).toBeUndefined();
});

test.each(["reviewing", "closed"] as const)(
  "sends a move to %s straight away without an issue number",
  (status) => {
    expect(planMove(status, "")).toEqual({
      kind: "send",
      request: { status },
    });
  },
);

test("leaves a typed issue number out of a move that has no issue", () => {
  expect(planMove("closed", "412")).toEqual({
    kind: "send",
    request: { status: "closed" },
  });
});

test.each(["published", "duplicate"] as const)(
  "asks first before a move to %s with an issue number",
  (status) => {
    expect(planMove(status, " #412 ")).toEqual({
      kind: "confirm",
      request: { status, issue: 412 },
    });
  },
);

test.each(["published", "duplicate"] as const)(
  "asks for the issue number of a move to %s when it is missing or wrong",
  (status) => {
    const expected = {
      kind: "issueNeeded",
      message: `Enter the issue number to mark this report ${status}. Use a whole number above zero.`,
    };

    expect(planMove(status, "")).toEqual(expected);
    expect(planMove(status, "abc")).toEqual(expected);
    expect(planMove(status, "0")).toEqual(expected);
  },
);

test.each([
  [{ status: "reviewing" }, { kind: "reviewing" }],
  [{ status: "closed" }, { kind: "closed" }],
  [
    { status: "published", issue: 412 },
    { kind: "published", issue: 412 },
  ],
  [
    { status: "duplicate", issue: 7 },
    { kind: "duplicate", issue: 7 },
  ],
] as const satisfies readonly (readonly [MoveRequest, Status])[])(
  "knows a successful %j leaves the report %j",
  (request, status) => {
    expect(statusOf(request)).toEqual(status);
  },
);

import { expect, test } from "vitest";

import type { ApiError } from "#lib/api.ts";
import { copy } from "#lib/copy.ts";
import { moveFailure, type MoveFailure } from "#lib/move-failure.ts";
import { SERVER_ERROR_KINDS, type MoveTarget } from "#lib/wire.ts";

type Recoveries = readonly ("reload" | "retry")[];

function alert(message: string, recoveries: Recoveries) {
  return { kind: "alert", message, recoveries } satisfies MoveFailure;
}

const ALERTS = [
  [{ kind: "relayUnavailable" }, copy.errors.relayUnavailable, ["retry"]],
  [{ kind: "timeout" }, copy.errors.timeout, ["reload", "retry"]],
  [{ kind: "networkFailure" }, copy.errors.networkFailure, ["reload", "retry"]],
  [{ kind: "unexpectedReply" }, copy.errors.unexpected, ["reload", "retry"]],
  [{ kind: "methodNotAllowed" }, copy.errors.unexpected, ["retry"]],
  [{ kind: "badRequest" }, copy.errors.unexpected, ["retry"]],
  [{ kind: "csrfRejected" }, copy.errors.csrfRejected, []],
  [{ kind: "signedOut" }, copy.errors.signedOut, []],
  [{ kind: "notFound" }, "This report no longer exists.", ["reload"]],
] as const satisfies readonly (readonly [ApiError, string, Recoveries])[];

test.each(ALERTS)("answers %j with an alert", (error, message, recoveries) => {
  for (const target of ["closed", "published"] as const) {
    expect(moveFailure(error, target)).toEqual(alert(message, recoveries));
  }
});

test.each(["timeout", "networkFailure"] as const)(
  "offers a reload before a retry after %s, since the move may have gone through",
  (kind) => {
    const failure = moveFailure({ kind }, "closed");

    expect(failure.kind === "alert" && failure.recoveries[0]).toBe("reload");
  },
);

test("tells a refused move which status the report is in and offers a reload", () => {
  expect(moveFailure({ kind: "refused", from: "published" }, "closed")).toEqual(
    alert("A published report cannot be moved to closed.", ["reload"]),
  );
  expect(moveFailure({ kind: "refused", from: "closed" }, "published")).toEqual(
    alert("A closed report cannot be moved to published.", ["reload"]),
  );
});

test("puts a missing issue number on the issue field for a move that needs one", () => {
  for (const target of ["published", "duplicate"] as const) {
    expect(moveFailure({ kind: "issueRequired" }, target)).toEqual({
      kind: "issue",
      message: `Enter the issue number to mark this report ${target}. Use a whole number above zero.`,
    });
  }
});

test.each(["reviewing", "closed"] as const)(
  "answers a missing issue number for a move to %s with the generic alert",
  (target) => {
    expect(moveFailure({ kind: "issueRequired" }, target)).toEqual(
      alert(copy.errors.unexpected, ["retry"]),
    );
  },
);

test("covers every server error kind", () => {
  const covered = new Set<string>([
    ...ALERTS.map(([error]) => error.kind),
    "issueRequired",
    "refused",
  ]);

  expect([...SERVER_ERROR_KINDS, "refused"].every((k) => covered.has(k))).toBe(
    true,
  );
});

test("never mentions the relay", () => {
  const targets: readonly MoveTarget[] = ["reviewing", "published"];
  for (const [error] of ALERTS) {
    for (const target of targets) {
      const failure = moveFailure(error, target);
      expect(failure.message.toLowerCase()).not.toContain("relay");
    }
  }
});

import { expect, test } from "vitest";

import type { ApiError } from "#lib/api.ts";
import { copy } from "#lib/copy.ts";
import { describeError } from "#lib/error-copy.ts";
import { SERVER_ERROR_KINDS, STATUS_KINDS } from "#lib/wire.ts";

const NAMED = [
  [{ kind: "relayUnavailable" }, copy.errors.relayUnavailable],
  [{ kind: "timeout" }, copy.errors.timeout],
  [{ kind: "networkFailure" }, copy.errors.networkFailure],
  [{ kind: "signedOut" }, copy.errors.signedOut],
  [{ kind: "csrfRejected" }, copy.errors.csrfRejected],
] as const satisfies readonly (readonly [ApiError, string])[];

const GENERIC_KINDS = SERVER_ERROR_KINDS.filter(
  (kind) => !NAMED.some(([error]) => error.kind === kind),
);

test.each(NAMED)("describes %j in its own words", (error, words) => {
  expect(describeError(error)).toBe(words);
});

test("tells the reviewer the reports service did not answer", () => {
  expect(describeError({ kind: "relayUnavailable" })).toBe(
    "The reports service did not answer. Try again in a moment.",
  );
});

test.each(GENERIC_KINDS)("describes the %s reply generically", (kind) => {
  expect(describeError({ kind })).toBe(copy.errors.unexpected);
});

test("describes a refused move and an unreadable reply generically", () => {
  expect(describeError({ kind: "refused", from: STATUS_KINDS[0] })).toBe(
    copy.errors.unexpected,
  );
  expect(describeError({ kind: "unexpectedReply" })).toBe(
    copy.errors.unexpected,
  );
});

test.each(Object.values(copy.errors))(
  "never mentions the relay in %s",
  (words) => {
    expect(words.toLowerCase()).not.toContain("relay");
  },
);

import { expect, test } from "vitest";

import { describeChange } from "#lib/audit-change.ts";
import type { AuditEntry } from "#lib/wire.ts";

const AT = 1_740_828_300;

const CHANGES = [
  [
    { previous: "received", status: { kind: "reviewing" } },
    "Received to Reviewing",
  ],
  [
    { previous: "reviewing", status: { kind: "published", issue: 412 } },
    "Reviewing to Published, issue #412",
  ],
  [
    { previous: "reviewing", status: { kind: "duplicate", issue: 7 } },
    "Reviewing to Duplicate, issue #7",
  ],
  [
    { previous: "reviewing", status: { kind: "closed" } },
    "Reviewing to Closed",
  ],
  [
    { previous: "closed", status: { kind: "reviewing" } },
    "Closed to Reviewing",
  ],
] as const satisfies readonly (readonly [
  Pick<AuditEntry, "previous" | "status">,
  string,
])[];

test.each(CHANGES)("words the change %j", (change, words) => {
  expect(describeChange({ ...change, actor: "alice", at: AT })).toBe(words);
});

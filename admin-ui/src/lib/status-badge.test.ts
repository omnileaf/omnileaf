import { expect, test } from "vitest";

import { statusBadgeLook } from "#lib/status-badge.ts";
import { STATUS_KINDS, type Status } from "#lib/wire.ts";

const LOOKS = [
  [{ kind: "received" }, "Received", "solid", "inbox"],
  [{ kind: "reviewing" }, "Reviewing", "soft", "eye"],
  [{ kind: "published", issue: 42 }, "Published", "outline", "circle-check"],
  [{ kind: "duplicate", issue: 7 }, "Duplicate", "chip", "copy"],
  [{ kind: "closed" }, "Closed", "muted-outline", "archive"],
] as const satisfies readonly (readonly [Status, string, string, string])[];

test.each(LOOKS)(
  "looks up the badge for %j",
  (status, label, variant, icon) => {
    expect(statusBadgeLook(status)).toEqual({ label, variant, icon });
  },
);

test("gives every status kind its own icon and its own word", () => {
  const looks = LOOKS.map(([status]) => statusBadgeLook(status));

  expect(LOOKS.map(([status]) => status.kind)).toEqual([...STATUS_KINDS]);
  expect(new Set(looks.map((look) => look.icon)).size).toBe(looks.length);
  expect(new Set(looks.map((look) => look.label)).size).toBe(looks.length);
});

test("never gives two statuses the same badge variant", () => {
  const looks = LOOKS.map(([status]) => statusBadgeLook(status).variant);

  expect(new Set(looks).size).toBe(looks.length);
});

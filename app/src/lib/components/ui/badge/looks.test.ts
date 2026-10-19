import { expect, test } from "vitest";

import { cn } from "#lib/components/cn.ts";

import { BADGE_LOOKS, type BadgeLook } from "./looks.ts";

test("keeps every class of every look through the class merge", () => {
  const looks = Object.entries(BADGE_LOOKS);

  const merged = looks.map(([look, classes]) => [look, cn(classes)]);

  expect(merged).toEqual(looks);
});

test.each<[BadgeLook, string[]]>([
  ["count", ["rounded-badge", "bg-accent", "font-medium", "text-on-accent"]],
  ["condition", ["rounded-full", "bg-accent-soft", "text-detail"]],
  ["header-accent", ["rounded-full", "bg-accent-soft", "text-accent"]],
  ["header-danger", ["rounded-full", "bg-danger-soft", "text-danger"]],
])("draws the %s look with its colours and shape", (look, signature) => {
  const classes = cn(BADGE_LOOKS[look]).split(" ");

  expect(classes).toEqual(expect.arrayContaining(signature));
});

import { expect, test } from "vitest";

import { expectOwnLook, html, tokensOf } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";
import { fillTemplate } from "#lib/template.ts";
import { STATUS_KINDS, type Status, type StatusKind } from "#lib/wire.ts";

import StatusBadge from "./status-badge.svelte";

const BADGE = /<span\b[^>]*>/;
const ICON = /<svg\b[^>]*>/;

const LOOKS = {
  received: ["bg-accent", "text-on-accent", "lucide-circle-dot"],
  reviewing: ["bg-accent-soft", "text-accent-ink", "lucide-clock"],
  published: ["border-accent", "text-accent-ink", "lucide-check"],
  duplicate: ["bg-chip", "text-muted", "lucide-copy"],
  closed: ["border-border", "text-muted", "lucide-circle-minus"],
} satisfies Record<StatusKind, readonly string[]>;

function aStatus(kind: StatusKind): Status {
  return kind === "published" || kind === "duplicate"
    ? { kind, issue: 12 }
    : { kind };
}

function lookOf(kind: StatusKind): readonly string[] {
  const markup = html(StatusBadge, { status: aStatus(kind) });
  return [...tokensOf(markup, BADGE), ...tokensOf(markup, ICON)];
}

test.each(STATUS_KINDS)(
  "draws the %s status with its own variant and its own icon",
  (kind) => {
    expectOwnLook(LOOKS, kind, lookOf(kind));
  },
);

test.each(STATUS_KINDS)("writes the %s status as its word", (kind) => {
  const markup = html(StatusBadge, { status: aStatus(kind) });
  const otherWords = STATUS_KINDS.filter((other) => other !== kind).map(
    (other) => copy.status[other],
  );

  expect(markup).toContain(copy.status[kind]);
  for (const other of otherWords) {
    expect(markup).not.toContain(other);
  }
});

test.each(STATUS_KINDS)("keeps the %s badge out of red", (kind) => {
  expect(lookOf(kind).join(" ")).not.toMatch(/danger|red|destructive/);
});

test("writes the issue number after the published word", () => {
  const markup = html(StatusBadge, {
    status: { kind: "published", issue: 412 },
  });

  const expected = fillTemplate(copy.statusWithIssue, {
    status: copy.status.published,
    issue: 412,
  });

  expect(markup.replace(/<!--.*?-->/gs, "")).toContain(expected);
});

test.each(["received", "reviewing", "duplicate", "closed"] as const)(
  "writes no issue number after the %s word",
  (kind) => {
    expect(html(StatusBadge, { status: aStatus(kind) })).not.toContain("#");
  },
);

test.each(STATUS_KINDS)(
  "draws the %s icon 12px wide inside the badge",
  (kind) => {
    const icon = tokensOf(html(StatusBadge, { status: aStatus(kind) }), ICON);

    expect(icon).toEqual(expect.arrayContaining(["block-3", "inline-3"]));
  },
);

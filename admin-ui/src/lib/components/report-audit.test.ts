import { expect, test } from "vitest";

import { html } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";
import type { AuditEntry } from "#lib/wire.ts";

import ReportAudit from "./report-audit.svelte";

const NEWER: AuditEntry = {
  previous: "reviewing",
  status: { kind: "published", issue: 412 },
  actor: "reviewer",
  at: 1_740_912_000,
};
const OLDER: AuditEntry = {
  previous: "received",
  status: { kind: "reviewing" },
  actor: "second-reviewer",
  at: 1_740_825_600,
};

function render(entries: readonly AuditEntry[]): string {
  return html(ReportAudit, { entries }).replace(/<!--.*?-->/gs, "");
}

test("titles the card and says the changes are newest first", () => {
  const markup = render([NEWER]);

  expect(markup).toMatch(/<h2\b[^>]*>\s*Audit trail\s*<\/h2>/);
  expect(markup).toContain(copy.audit.hint);
});

test("says nothing has changed yet when the trail is empty", () => {
  const markup = render([]);

  expect(markup).toContain("No status changes yet.");
  expect(markup).not.toContain("<table");
  expect(markup).not.toContain("<li");
});

test("heads the table with when, who and change", () => {
  const markup = render([NEWER]);

  for (const column of ["When", "Who", "Change"]) {
    expect(markup).toMatch(
      new RegExp(`<th\\b[^>]*scope="col"[^>]*>${column}</th>`),
    );
  }
});

test("writes each change in the table with its moment, actor and words", () => {
  const markup = render([NEWER, OLDER]);
  const rows = markup.match(/<tr\b[\s\S]*?<\/tr>/g)?.slice(1) ?? [];

  expect(rows).toHaveLength(2);
  expect(rows[0]).toContain("2025-03-02 10:40 UTC");
  expect(rows[0]).toContain("reviewer");
  expect(rows[0]).toContain("Reviewing to Published, issue #412");
  expect(rows[1]).toContain("2025-03-01 10:40 UTC");
  expect(rows[1]).toContain("second-reviewer");
  expect(rows[1]).toContain("Received to Reviewing");
});

test("lists the same changes as stacked items for a phone, in the same order", () => {
  const markup = render([NEWER, OLDER]);
  const items = markup.match(/<li\b[\s\S]*?<\/li>/g) ?? [];

  expect(items).toHaveLength(2);
  expect(items[0]).toContain("Reviewing to Published, issue #412");
  expect(items[0]).toContain("reviewer");
  expect(items[0]).toContain('datetime="2025-03-02T10:40:00.000Z"');
  expect(items[1]).toContain("Received to Reviewing");
});

test("shows the phone list only below the tablet width and the table from it", () => {
  const markup = render([NEWER]);

  expect(markup).toMatch(/<ul\b[^>]*class="[^"]*\btablet:hidden\b/);
  expect(markup).toMatch(
    /<div\b[^>]*class="[^"]*\bhidden\b[^"]*\btablet:block\b[^"]*"[^>]*>\s*<div\b[^>]*data-slot="table-container"/,
  );
});

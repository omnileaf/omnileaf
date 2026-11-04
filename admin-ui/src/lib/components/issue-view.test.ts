import { expect, test, vi } from "vitest";

import { html } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";
import type { IssueState } from "#lib/issue-store.svelte.ts";

import IssueView from "./issue-view.svelte";

const CODE = "R-0A5C-J6VN";
const BODY = "**Report R-0A5C-J6VN**\n\nLibrary scan stops at 40%";

const STATES: readonly IssueState[] = [
  { kind: "loading" },
  { kind: "ready", body: BODY },
  { kind: "purged" },
  { kind: "notFound" },
  { kind: "failed", message: copy.errors.relayUnavailable },
];

function view(load: IssueState): string {
  return html(IssueView, { code: CODE, load, onRetry: vi.fn() }).replace(
    /<!--.*?-->/gs,
    "",
  );
}

test.each(STATES)(
  "titles the page with the report code in every state: $kind",
  (load) => {
    const markup = view(load);

    expect(markup).toMatch(
      /<h1\b[^>]*\stabindex="-1"[^>]*>\s*Copy R-0A5C-J6VN as a public issue\s*<\/h1>/,
    );
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
  },
);

test.each(STATES)(
  "shows where the page sits: reports, the report, then this page: $kind",
  (load) => {
    const markup = view(load);

    expect(markup).toContain(`aria-label="${copy.breadcrumb}"`);
    expect(markup).toMatch(/<a\b[^>]*href="\/admin\/reports"[^>]*>\s*Reports/);
    expect(markup).toMatch(
      new RegExp(`<a\\b[^>]*href="/admin/reports/${CODE}"[^>]*>\\s*${CODE}`),
    );
    expect(markup).toMatch(
      /<span\b[^>]*aria-current="page"[^>]*>\s*Public issue\s*<\/span>/,
    );
  },
);

test("shows a busy skeleton and announces the loading", () => {
  const markup = view({ kind: "loading" });

  expect(markup).toMatch(/aria-busy="true"/);
  expect(markup).toMatch(/role="status"[^>]*>Loading the issue text</);
  expect(markup).not.toContain("<textarea");
});

test("shows the issue text and the ways to copy it or go back", () => {
  const markup = view({ kind: "ready", body: BODY });

  expect(markup).toContain("**Report R-0A5C-J6VN**");
  expect(markup).toMatch(/<textarea\b/);
  expect(markup).toMatch(
    /<button\b[^>]*type="button"[^>]*>[\s\S]*Copy text[\s\S]*<\/button>/,
  );
  expect(markup).toMatch(
    new RegExp(
      `<a\\b[^>]*href="/admin/reports/${CODE}"[^>]*>\\s*Back to the report`,
    ),
  );
});

test("says there is nothing to copy once the text was purged", () => {
  const markup = view({ kind: "purged" });

  expect(markup).toMatch(/<h2\b[^>]*>\s*Nothing to copy\s*<\/h2>/);
  expect(markup).toContain(copy.issue.purgedHint);
  expect(markup).toMatch(
    new RegExp(
      `<a\\b[^>]*href="/admin/reports/${CODE}"[^>]*>\\s*Back to the report`,
    ),
  );
  expect(markup).not.toContain("<textarea");
  expect(markup).not.toContain("Copy text");
});

test("says the report does not exist", () => {
  const markup = view({ kind: "notFound" });

  expect(markup).toContain(copy.report.notFound);
  expect(markup).not.toContain("<textarea");
});

test("announces a failed load in an alert with a retry button", () => {
  const markup = view({ kind: "failed", message: copy.errors.timeout });

  expect(markup).toMatch(/role="alert"/);
  expect(markup).toContain("Could not load the issue text");
  expect(markup).toContain(copy.errors.timeout);
  expect(markup).toMatch(
    /<button\b[^>]*type="button"[^>]*>\s*Try again\s*<\/button>/,
  );
});

test.each(["/x", "a?b#c", "%41"])(
  "renders the page for the odd code %j without failing",
  (code) => {
    const markup = html(IssueView, {
      code,
      load: { kind: "notFound" },
      onRetry: vi.fn(),
    });

    expect(markup).toContain(`/admin/reports/${encodeURIComponent(code)}"`);
    expect(markup).toContain(copy.report.notFound);
  },
);

test.each([{ kind: "ready", body: "text" }, { kind: "purged" }] as const)(
  "keeps the way back to the report in one path segment when the page is %j",
  (load) => {
    const markup = html(IssueView, { code: "/x", load, onRetry: vi.fn() });

    expect(markup).toMatch(
      /<a\b[^>]*href="\/admin\/reports\/%2Fx"[^>]*>\s*(?:<!---->)*\s*Back to the report/,
    );
  },
);

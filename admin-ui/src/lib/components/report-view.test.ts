import { expect, test, vi } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";
import type { ReportState } from "#lib/report-store.svelte.ts";
import { aListed } from "#lib/testing.ts";
import type { ReportDetail } from "#lib/wire.ts";

import ReportView from "./report-view.svelte";

const CODE = "R-2222-2222";
const MOMENT = 1_740_828_300;

function detail(overrides: Partial<ReportDetail> = {}): ReportDetail {
  return {
    listed: aListed({
      receivedAt: MOMENT,
      status: { kind: "published", issue: 412 },
      platform: "ios",
      version: "1.3.2",
    }),
    report: "text",
    audit: [],
    ...overrides,
  };
}

const READY: ReportState = { kind: "ready", detail: detail() };
const STATES: readonly ReportState[] = [
  { kind: "loading" },
  READY,
  { kind: "notFound" },
  { kind: "failed", message: copy.errors.relayUnavailable },
];

function view(load: ReportState, onRetry = vi.fn()): string {
  return html(ReportView, { code: CODE, load, onRetry }).replace(
    /<!--.*?-->/gs,
    "",
  );
}

test.each(STATES)(
  "titles the page with the code in every state: $kind",
  (load) => {
    const markup = view(load);

    expect(markup).toMatch(
      new RegExp(`<h1\\b[^>]*\\stabindex="-1"[^>]*>\\s*${CODE}\\s*</h1>`),
    );
    expect(tokensOf(markup, /<h1\b[^>]*>/)).toEqual(
      expect.arrayContaining(["font-mono", "wrap-anywhere"]),
    );
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
  },
);

test.each(STATES)(
  "offers a way back to the reports in every state: $kind",
  (load) => {
    const markup = view(load);

    expect(markup).toContain(`aria-label="${copy.breadcrumb}"`);
    expect(markup).toMatch(
      /<a\b[^>]*href="\/admin\/reports"[^>]*>[\s\S]*Reports[\s\S]*<\/a>/,
    );
  },
);

test("shows a busy skeleton and announces the loading while the report arrives", () => {
  const markup = view({ kind: "loading" });

  expect(markup).toMatch(/aria-busy="true"/);
  expect(markup).toMatch(/role="status"[^>]*>Loading report</);
  expect(markup).not.toContain("<dl");
  expect(markup).not.toContain(copy.status.published);
});

test("shows the status badge with the issue number beside the code", () => {
  const markup = view(READY);

  expect(markup.indexOf("</h1>")).toBeLessThan(markup.indexOf("Published"));
  expect(markup).toMatch(/Published\s*#412/);
});

test("lists the platform, version and received time as facts", () => {
  const markup = view(READY);

  expect(markup).toMatch(/<dl\b/);
  for (const [term, value] of [
    [copy.report.facts.platform, "ios"],
    [copy.report.facts.version, "1.3.2"],
    [copy.report.facts.received, "2025-03-01 11:25 UTC"],
  ] as const) {
    expect(markup).toMatch(
      new RegExp(`<dt\\b[^>]*>${term}</dt>\\s*<dd\\b[^>]*>[\\s\\S]*?${value}`),
    );
  }
  expect(markup).toContain('datetime="2025-03-01T11:25:00.000Z"');
});

test("says the report does not exist and offers the list", () => {
  const markup = view({ kind: "notFound" });

  expect(markup).toMatch(/<h2\b[^>]*>\s*This report does not exist\s*<\/h2>/);
  expect(markup).toContain(copy.report.notFoundHint);
  expect(markup).not.toContain("<dl");
  expect(markup).toMatch(
    /<a\b[^>]*href="\/admin\/reports"[^>]*>\s*View all reports/,
  );
});

test("announces a failed load in an alert with a retry button", () => {
  const markup = view({ kind: "failed", message: copy.errors.timeout });

  expect(markup).toMatch(/role="alert"/);
  expect(markup).toContain(copy.report.loadFailed);
  expect(markup).toContain(copy.errors.timeout);
  expect(markup).toMatch(
    /<button\b[^>]*type="button"[^>]*>\s*Try again\s*<\/button>/,
  );
  expect(markup).not.toContain("<dl");
});

test("shows the report text and then the audit trail under the facts", () => {
  const markup = view({
    kind: "ready",
    detail: detail({ report: "Scan stops at 40%" }),
  });

  expect(markup).toContain("Scan stops at 40%");
  expect(markup.indexOf("</dl>")).toBeLessThan(markup.indexOf("<pre"));
  expect(markup.indexOf("<pre")).toBeLessThan(markup.indexOf("Audit trail"));
});

test("says the text was purged when the service no longer holds it", () => {
  const markup = view({ kind: "ready", detail: detail({ report: null }) });

  expect(markup).toContain(copy.report.text.purged);
  expect(markup).toContain("Audit trail");
});

test("passes the audit entries on newest first as they arrive", () => {
  const markup = view({
    kind: "ready",
    detail: detail({
      audit: [
        {
          previous: "reviewing",
          status: { kind: "published", issue: 412 },
          actor: "reviewer",
          at: MOMENT + 60,
        },
        {
          previous: "received",
          status: { kind: "reviewing" },
          actor: "second-reviewer",
          at: MOMENT,
        },
      ],
    }),
  });

  expect(markup.indexOf("Reviewing to Published")).toBeLessThan(
    markup.indexOf("Received to Reviewing"),
  );
});

test.each([
  { kind: "loading" },
  { kind: "notFound" },
  { kind: "failed", message: copy.errors.timeout },
] as const)(
  "shows neither text nor audit trail while the report is $kind",
  (load) => {
    const markup = view(load);

    expect(markup).not.toMatch(/<h2\b[^>]*>\s*Report\s*<\/h2>/);
    expect(markup).not.toContain(copy.audit.title);
  },
);

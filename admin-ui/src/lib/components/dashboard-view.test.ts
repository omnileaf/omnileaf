import { expect, test } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";
import type { ReportsState } from "#lib/reports-store.svelte.ts";
import { aCode, aListed } from "#lib/testing.ts";
import type { Listed } from "#lib/wire.ts";

import DashboardView from "./dashboard-view.svelte";

const OLDEST_MOMENT = 1_740_828_300;
const DAY = 24 * 60 * 60;

const OLDEST = aListed({
  code: aCode("R-1111-1111"),
  receivedAt: OLDEST_MOMENT,
  platform: "android",
  version: "1.4.0",
});
const NEWEST = aListed({
  code: aCode("R-3333-3333"),
  receivedAt: OLDEST_MOMENT + 4 * DAY,
  platform: "linux",
  version: "1.4.0",
});
const PUBLISHED = aListed({
  code: aCode("R-2222-2222"),
  receivedAt: OLDEST_MOMENT - 9 * DAY,
  status: { kind: "published", issue: 7 },
  platform: "linux",
  version: "1.3.2",
});

function ready(reports: readonly Listed[], truncated = false): ReportsState {
  return { kind: "ready", reports, truncated };
}

function view(state: ReportsState): string {
  return html(DashboardView, {
    load: state,
    onRetry: () => undefined,
  }).replace(/<!--.*?-->/gs, "");
}

const WITH_REPORTS = ready([NEWEST, PUBLISHED, OLDEST]);

test("titles the dashboard and says how many reports it covers", () => {
  for (const state of [
    { kind: "loading" },
    { kind: "failed", message: "x" },
    WITH_REPORTS,
  ] as const) {
    const markup = view(state);

    expect(markup).toMatch(/<h1\b[^>]*>\s*Dashboard\s*<\/h1>/);
    expect(markup).toContain("Counts cover the newest 500 reports.");
  }
});

test("shows hidden skeletons and a polite loading note while loading", () => {
  const markup = view({ kind: "loading" });

  expect(markup).toContain('aria-busy="true"');
  expect(markup).toContain(copy.reports.loading);
  expect(markup).toContain('data-slot="skeleton"');
  expect(markup.match(/role="status"/g)).toHaveLength(1);
  expect(markup).not.toContain("<ul");
});

test("shows the failure with a retry instead of the numbers", () => {
  const markup = view({ kind: "failed", message: copy.errors.timeout });

  expect(markup).toMatch(/role="alert"/);
  expect(markup).toContain(copy.errors.timeout);
  expect(markup).toMatch(/<button\b[^>]*>[\s\S]*Try again/);
  expect(markup).not.toContain("By platform");
});

test("shows the empty state when no report has come in", () => {
  const markup = view(ready([]));

  expect(markup).toContain("No reports yet");
  expect(markup).not.toContain("By platform");
});

test("counts each status in a card that links to the reports of that status", () => {
  const markup = view(WITH_REPORTS);

  for (const kind of [
    "received",
    "reviewing",
    "published",
    "duplicate",
    "closed",
  ]) {
    expect(markup).toContain(`href="/admin/reports?status=${kind}"`);
  }
  expect(markup).toMatch(/>\s*2\s*<\/span>\s*<span[^>]*>\s*Waiting for review/);
});

test("breaks the reports down by platform and by version in bars", () => {
  const markup = view(WITH_REPORTS);

  expect(markup).toMatch(/<h2\b[^>]*>\s*By platform\s*<\/h2>/);
  expect(markup).toMatch(/<h2\b[^>]*>\s*By version\s*<\/h2>/);
  expect(markup).toContain("Reports in the newest 500.");
  expect(markup).toContain("App version that sent the report.");
});

function between(markup: string, from: string, to: string): string {
  const start = markup.indexOf(from);
  return markup.slice(start, markup.indexOf(to, start));
}

function barWidths(section: string): string[] {
  return [...section.matchAll(/<rect\b[^>]*\swidth="([\d.]+)"/g)].map(
    ([, width = ""]) => width,
  );
}

test("draws the platform bars from platforms and the version bars from versions", () => {
  const markup = view(WITH_REPORTS);
  const platforms = between(markup, "By platform", "By version");
  const versions = between(markup, "By version", "Waiting longest");

  expect(platforms).toMatch(/linux[\s\S]*android/);
  expect(platforms).not.toContain("1.4.0");
  expect(barWidths(platforms)).toEqual(["100", "50"]);
  expect(versions).toMatch(/1\.4\.0[\s\S]*1\.3\.2/);
  expect(versions).not.toContain("linux");
  expect(barWidths(versions)).toEqual(["100", "50"]);
});

test("lists the oldest received reports first and leaves out the reviewed ones", () => {
  const markup = view(WITH_REPORTS);
  const review = markup.slice(markup.indexOf("Waiting longest"));

  expect(review.indexOf("R-1111-1111")).toBeGreaterThan(-1);
  expect(review.indexOf("R-1111-1111")).toBeLessThan(
    review.indexOf("R-3333-3333"),
  );
  expect(review).not.toContain("R-2222-2222");
});

test("shows the platform, the version and the UTC moment of each waiting report", () => {
  const markup = view(WITH_REPORTS);
  const review = markup.slice(markup.indexOf("Waiting longest"));

  expect(review).toContain("android");
  expect(review).toContain("1.4.0");
  expect(review).toContain("2025-03-01 11:25 UTC");
  expect(review).toContain('datetime="2025-03-01T11:25:00.000Z"');
  expect(review).toContain("2025-03-05 11:25 UTC");
});

test("links to every received report from the waiting longest heading as tall as a button", () => {
  const markup = view(WITH_REPORTS);
  const link =
    /<a\b[^>]*href="\/admin\/reports\?status=received"[^>]*>(?=\s*View all reports)/.exec(
      markup,
    )?.[0];

  expect(tokensOf(link ?? "", /<a\b[^>]*>/)).toEqual(
    expect.arrayContaining([
      "border-field-edge",
      "px-3",
      "block-11",
      "tablet:block-8",
      "tablet:bg-transparent",
      "tablet:border-transparent",
      "tablet:hover:bg-chip",
    ]),
  );

  expect(markup).toMatch(
    /<a\b[^>]*href="\/admin\/reports\?status=received"[^>]*>\s*View all reports/,
  );
});

test("shows at most ten reports that need a review", () => {
  const many = Array.from({ length: 12 }, (_, index) =>
    aListed({
      code: aCode(`R-${String(1000 + index)}-AAAA`),
      receivedAt: index,
    }),
  );

  const markup = view(ready(many));
  const review = markup.slice(markup.indexOf("Waiting longest"));

  expect(review.match(/<li\b/g)).toHaveLength(10);
});

test("says so when nothing waits for a review", () => {
  const markup = view(ready([PUBLISHED]));

  expect(markup).toContain(copy.dashboard.nothingToReview);
});

test("footnotes a truncated list and only then", () => {
  expect(view(ready([OLDEST], true))).toContain(copy.dashboard.truncated);
  expect(view(ready([OLDEST], false))).not.toContain(copy.dashboard.truncated);
});

test("never emits an inline style", () => {
  for (const state of [{ kind: "loading" }, WITH_REPORTS] as const) {
    expect(view(state)).not.toMatch(/\sstyle=/);
  }
});

test("says a shorter sentence on a phone and the full one from the tablet width", () => {
  const markup = view(WITH_REPORTS);
  const phone =
    /<p\b[^>]*tablet:hidden[^>]*>\s*Reports from the newest 500\./.exec(
      markup,
    )?.[0];
  const tablet =
    /<p\b[^>]*hidden tablet:block[^>]*>\s*Counts cover the newest 500 reports\./.exec(
      markup,
    )?.[0];

  expect(phone).toBeDefined();
  expect(tablet).toBeDefined();
});

test("ends the footnote about older reports with a full stop", () => {
  expect(view(ready([OLDEST], true))).toContain("older ones are not counted.");
});

test("shows the loading note as visible muted small text above the skeletons", () => {
  const markup = view({ kind: "loading" });
  const note = /<p\b[^>]*role="status"[^>]*>/.exec(markup)?.[0] ?? "";

  expect(tokensOf(note, /<p\b[^>]*>/)).toEqual(
    expect.arrayContaining(["text-small", "text-muted"]),
  );
  expect(tokensOf(note, /<p\b[^>]*>/)).not.toContain("sr-only");
  expect(markup.indexOf("Loading reports")).toBeLessThan(
    markup.indexOf('data-slot="skeleton"'),
  );
});

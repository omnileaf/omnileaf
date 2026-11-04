import { expect, test } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";
import type { ReportsState } from "#lib/reports-store.svelte.ts";
import type { ReportFilter } from "#lib/reports.ts";
import { aCode, aListed } from "#lib/testing.ts";
import type { Listed } from "#lib/wire.ts";

import ReportsView from "./reports-view.svelte";

const MOMENT = 1_740_828_300;

const NEWEST = aListed({
  code: aCode("R-3333-3333"),
  receivedAt: MOMENT + 100,
  platform: "linux",
  version: "1.4.0",
});
const MIDDLE = aListed({
  code: aCode("R-2222-2222"),
  receivedAt: MOMENT,
  status: { kind: "published", issue: 7 },
  platform: "android",
  version: "1.3.2",
});
const OLDEST = aListed({
  code: aCode("R-1111-1111"),
  receivedAt: MOMENT - 100,
  status: { kind: "closed" },
  platform: "android",
  version: "1.3.2",
});
const THREE = [NEWEST, MIDDLE, OLDEST];

function ready(reports: readonly Listed[], truncated = false): ReportsState {
  return { kind: "ready", reports, truncated };
}

function view(load: ReportsState, filter: ReportFilter = {}): string {
  return html(ReportsView, {
    load,
    filter,
    onChange: () => undefined,
    onRetry: () => undefined,
  }).replace(/<!--.*?-->/gs, "");
}

function codesInOrder(markup: string): string[] {
  return [...new Set(markup.match(/R-[0-9A-Z]{4}-[0-9A-Z]{4}/g) ?? [])];
}

function clearButtons(markup: string): number {
  return (markup.match(/Clear filters\s*<\/button>/g) ?? []).length;
}

test("titles the page and says what it searches in every state", () => {
  for (const load of [
    { kind: "loading" },
    { kind: "failed", message: "x" },
    ready(THREE),
    ready([]),
  ] as const) {
    const markup = view(load);

    expect(markup).toMatch(/<h1\b[^>]*>\s*Reports\s*<\/h1>/);
    expect(markup).toContain(copy.reports.subtitle);
  }
});

test("keeps the filters in view while loading and shows hidden skeletons", () => {
  const markup = view({ kind: "loading" });

  expect(markup).toContain("<search");
  expect(markup).toContain('aria-busy="true"');
  expect(markup).toContain(copy.reports.loading);
  expect(markup).toContain('data-slot="skeleton"');
  expect(markup).not.toContain("<table");
});

test("keeps the filters in view when loading failed and offers a retry", () => {
  const markup = view({
    kind: "failed",
    message: copy.errors.relayUnavailable,
  });

  expect(markup).toContain("<search");
  expect(markup).toMatch(/role="alert"/);
  expect(markup).toContain(
    "The reports service did not answer. Try again in a moment.",
  );
  expect(markup).toMatch(/<button\b[^>]*>\s*Try again/);
  expect(markup).not.toContain("<table");
});

test("shows the empty library without filters", () => {
  const markup = view(ready([]));

  expect(markup).toContain("No reports yet");
  expect(markup).not.toContain("<search");
  expect(markup).not.toContain("<table");
});

test("lists the reports newest first as the service returned them", () => {
  const markup = view(ready(THREE));

  expect(codesInOrder(markup)).toEqual([
    "R-3333-3333",
    "R-2222-2222",
    "R-1111-1111",
  ]);
  expect(markup).toContain("<table");
  expect(markup.match(/data-slot="badge"/g)).toHaveLength(6);
});

test("announces how many reports are listed politely", () => {
  const markup = view(ready(THREE));

  expect(markup).toMatch(
    /<p\b[^>]*aria-live="polite"[^>]*>\s*3 reports\s*<\/p>/,
  );
});

test("announces the filtered count against the whole list", () => {
  const markup = view(ready(THREE), { platform: "android" });

  expect(markup).toMatch(
    /<p\b[^>]*aria-live="polite"[^>]*>\s*2 of 3 reports\s*<\/p>/,
  );
});

test("announces the window a truncated list covers", () => {
  const markup = view(ready(THREE, true), { status: "received" });

  expect(markup).toMatch(
    /aria-live="polite"[^>]*>\s*1 of the newest 3 reports\s*</,
  );
});

test("lists only the reports the filter keeps", () => {
  const markup = view(ready(THREE), { status: "closed" });

  expect(codesInOrder(markup)).toEqual(["R-1111-1111"]);
});

test("searches by code and by issue number", () => {
  expect(codesInOrder(view(ready(THREE), { search: "r-2222" }))).toEqual([
    "R-2222-2222",
  ]);
  expect(codesInOrder(view(ready(THREE), { search: "#7" }))).toEqual([
    "R-2222-2222",
  ]);
});

test("offers the platforms and versions found in the reports", () => {
  const markup = view(ready(THREE));

  expect(markup).toMatch(/<option\b[^>]*value="android"/);
  expect(markup).toMatch(/<option\b[^>]*value="linux"/);
  expect(markup).toMatch(/<option\b[^>]*value="1.4.0"/);
  expect(markup).toMatch(/<option\b[^>]*value="1.3.2"/);
});

test("says so and offers to clear when nothing matches", () => {
  const markup = view(ready(THREE), { search: "zzz" });

  expect(markup).toContain("No reports match");
  expect(markup).toMatch(/aria-live="polite"[^>]*>\s*0 of 3 reports\s*</);
  expect(markup).not.toContain("<table");
  expect(clearButtons(markup)).toBe(1);
});

test("offers one clear button next to the filters while some filter is set", () => {
  expect(clearButtons(view(ready(THREE)))).toBe(0);
  expect(clearButtons(view(ready(THREE), { status: "closed" }))).toBe(1);
});

test("never emits an inline style", () => {
  for (const load of [{ kind: "loading" }, ready(THREE)] as const) {
    expect(view(load, { status: "closed" })).not.toMatch(/\sstyle=/);
  }
});

test("shows the subtitle from the tablet width up only", () => {
  const markup = view(ready(THREE));
  const subtitle = /<p\b[^>]*>(?=\s*Search and filter)/.exec(markup)?.[0] ?? "";

  expect(markup).toContain("Search and filter the newest 500 reports.");
  expect(tokensOf(subtitle, /<p\b[^>]*>/)).toEqual(
    expect.arrayContaining(["hidden", "tablet:block"]),
  );
});

test("offers the platforms and versions of every report, not only the matches", () => {
  const markup = view(ready(THREE), { status: "closed" });

  expect(codesInOrder(markup)).toEqual(["R-1111-1111"]);
  expect(markup).toMatch(/<option\b[^>]*value="linux"/);
  expect(markup).toMatch(/<option\b[^>]*value="1.4.0"/);
});

test("keeps the platform and version a link asked for even without reports of them", () => {
  const markup = view(ready(THREE), { platform: "windows", version: "0.1.0" });

  expect(markup).toMatch(/<option\b[^>]*value="windows"[^>]*selected/);
  expect(markup).toMatch(/<option\b[^>]*value="0.1.0"[^>]*selected/);
});

test("treats a search of only spaces as no filter at all", () => {
  const markup = view(ready(THREE), { search: "   " });

  expect(codesInOrder(markup)).toHaveLength(3);
  expect(clearButtons(markup)).toBe(0);
  expect(markup).not.toContain("No reports match");
  expect(markup).toMatch(/aria-live="polite"[^>]*>\s*3 reports\s*</);
});

test("has one live region for the count and none while loading", () => {
  expect(view(ready(THREE)).match(/aria-live=/g)).toHaveLength(1);
  expect(view({ kind: "loading" }).match(/role="status"/g)).toHaveLength(1);
  expect(view({ kind: "loading" })).not.toContain("aria-live=");
});

test("shows when each report was received in UTC", () => {
  const markup = view(ready(THREE));

  expect(markup).toContain("2025-03-01 11:25 UTC");
  expect(markup).toContain('datetime="2025-03-01T11:25:00.000Z"');
});

test("shows the loading note as visible muted small text above the skeleton rows", () => {
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

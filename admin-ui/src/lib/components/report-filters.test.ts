import { expect, test, vi } from "vitest";

import type { FilterOptions } from "#lib/filter-options.ts";
import { html, tokensOf } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";
import type { ReportFilter } from "#lib/reports.ts";

import ReportFilters from "./report-filters.svelte";

const OPTIONS: FilterOptions = {
  platforms: ["android", "linux"],
  versions: ["1.4.0", "1.3.2"],
};

function filters(filter: ReportFilter = {}, onClear?: () => void): string {
  return html(ReportFilters, {
    filter,
    options: OPTIONS,
    onChange: vi.fn(),
    ...(onClear === undefined ? {} : { onClear }),
  }).replace(/<!--.*?-->/gs, "");
}

function select(markup: string, id: string): string {
  return (
    new RegExp(`<select\\b[^>]*id="${id}"[\\s\\S]*?</select>`).exec(
      markup,
    )?.[0] ?? ""
  );
}

test("groups the controls in a labelled search region", () => {
  expect(filters()).toMatch(/<search\b[^>]*aria-label="Filter reports"/);
  expect(filters()).not.toContain('role="search"');
});

test("labels a search box that is typed into, not a placeholder alone", () => {
  const markup = filters({ search: "R-11" });

  expect(markup).toMatch(/<label\b[^>]*for="report-search"[^>]*>\s*Search\s*</);
  expect(markup).toMatch(/<input\b[^>]*id="report-search"/);
  expect(markup).toMatch(/<input\b[^>]*type="search"/);
  expect(markup).toMatch(/<input\b[^>]*value="R-11"/);
  expect(markup).toContain(copy.reports.searchPlaceholder);
});

test.each([
  ["report-status", "Status"],
  ["report-platform", "Platform"],
  ["report-version", "App version"],
])("labels the %s select", (id, label) => {
  const markup = filters();

  expect(markup).toMatch(
    new RegExp(`<label\\b[^>]*for="${id}"[^>]*>\\s*${label}\\s*<`),
  );
  expect(select(markup, id)).toContain("<select");
});

test("offers every status after an all option", () => {
  const options = [
    ...select(filters(), "report-status").matchAll(/<option\b[^>]*>([^<]*)</g),
  ].map(([, text]) => text);

  expect(options).toEqual([
    "Any status",
    "Received",
    "Reviewing",
    "Published",
    "Duplicate",
    "Closed",
  ]);
});

test("offers the platforms and the versions it was given", () => {
  const markup = filters();
  const texts = (id: string) =>
    [...select(markup, id).matchAll(/<option\b[^>]*>([^<]*)</g)].map(
      ([, text]) => text,
    );

  expect(texts("report-platform")).toEqual([
    "Any platform",
    "android",
    "linux",
  ]);
  expect(texts("report-version")).toEqual(["Any version", "1.4.0", "1.3.2"]);
});

test("selects what the filter holds", () => {
  const markup = filters({ status: "reviewing", platform: "linux" });

  expect(select(markup, "report-status")).toMatch(
    /<option\b[^>]*value="reviewing"[^>]*selected/,
  );
  expect(select(markup, "report-platform")).toMatch(
    /<option\b[^>]*value="linux"[^>]*selected/,
  );
});

test("lays the controls in one row from the tablet width and stacked on a phone", () => {
  const markup = filters();

  expect(tokensOf(markup, /<search\b[^>]*>/)).toEqual(
    expect.arrayContaining(["flex-col", "tablet:flex-row"]),
  );
});

test("shows a clear button only when there is something to clear", () => {
  expect(filters({ status: "closed" })).not.toContain(
    copy.reports.clearFilters,
  );
  expect(filters({ status: "closed" }, () => undefined)).toMatch(
    /<button\b[^>]*type="button"[^>]*>\s*Clear filters\s*<\/button>/,
  );
});

test("never emits an inline style", () => {
  expect(filters({ search: "x" }, () => undefined)).not.toMatch(/\sstyle=/);
});

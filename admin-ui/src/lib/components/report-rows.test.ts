import { expect, test } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";
import type { ReportColumn } from "#lib/report-columns.ts";
import { aCode, aListed } from "#lib/testing.ts";

import ReportRows from "./report-rows.svelte";

const BOARD_MOMENT = 1_740_828_300;
const COLUMNS: readonly ReportColumn[] = ["platform", "version", "received"];
const FIRST = aListed({
  code: aCode("R-1111-1111"),
  platform: "android",
  version: "1.4.0",
  receivedAt: BOARD_MOMENT,
});
const SECOND = aListed({
  code: aCode("R-2222-2222"),
  platform: "linux",
  version: "1.3.2",
});

function withoutMarkers(text: string): string {
  return text.replace(/<!--.*?-->/gs, "").trim();
}

function rows(reports = [FIRST, SECOND]): string {
  return html(ReportRows, { reports, columns: COLUMNS });
}

test("heads the table with one column header per column after the code", () => {
  const markup = rows();
  const headers = [
    ...markup.matchAll(/<th\b[^>]*scope="col"[^>]*>(.*?)<\/th>/gs),
  ];

  expect(headers.map(([, text]) => withoutMarkers(text ?? ""))).toEqual([
    "Code",
    "Platform",
    "Version",
    "Received",
  ]);
});

test("links each code to its report in monospace in both layouts", () => {
  const markup = rows();
  const links = [
    ...markup.matchAll(/<a\b[^>]*href="\/admin\/reports\/(R-[^"]+)"[^>]*>/g),
  ];

  expect(links.map(([, code]) => code)).toEqual([
    "R-1111-1111",
    "R-2222-2222",
    "R-1111-1111",
    "R-2222-2222",
  ]);
  expect(tokensOf(links[0]?.[0] ?? "", /<a\b[^>]*>/)).toContain("font-mono");
});

test("shows the platform, the version and the UTC moment of every report", () => {
  const markup = rows();

  expect(markup).toContain("android");
  expect(markup).toContain("1.4.0");
  expect(markup.match(/2025-03-01 11:25 UTC/g)).toHaveLength(2);
  expect(markup.match(/datetime="2025-03-01T11:25:00.000Z"/g)).toHaveLength(2);
});

test("shows a list on a phone and the table from the tablet width", () => {
  const markup = rows();

  expect(markup).toMatch(/<ul\b[^>]*class="[^"]*tablet:hidden/);
  expect(markup).toMatch(/<div\b[^>]*class="[^"]*hidden tablet:block/);
  expect(markup).toContain("<table");
});

test("makes each code link 44px high on a phone and 36px from the tablet width", () => {
  const tokens = tokensOf(rows(), /<a\b[^>]*font-mono[^>]*>/);

  expect(tokens).toEqual(
    expect.arrayContaining(["block-11", "tablet:block-9"]),
  );
  expect(tokens).not.toContain("tablet:block-6");
});

function bodyRows(markup: string): number {
  const body = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/.exec(markup)?.[1] ?? "";
  return (body.match(/<tr\b/g) ?? []).length;
}

test("writes one table row and one list item per report", () => {
  const markup = rows();

  expect(bodyRows(markup)).toBe(2);
  expect(markup.match(/<li\b/g)).toHaveLength(2);
});

test("writes no rows for no reports", () => {
  const markup = rows([]);

  expect(markup).not.toContain("<li");
  expect(bodyRows(markup)).toBe(0);
});

test("never emits an inline style", () => {
  expect(rows()).not.toMatch(/\sstyle=/);
});

import { expect, test } from "vitest";

import type { BarRow } from "#lib/bars.ts";
import { html, tokensOf } from "#lib/components/ui/render.ts";

import BarList from "./bar-list.svelte";

const ROWS: readonly BarRow[] = [
  { label: "linux", count: 8, percent: 100 },
  { label: "android", count: 2, percent: 25 },
];

test("lists a label and a count for every row", () => {
  const markup = html(BarList, { rows: ROWS });

  expect(markup.match(/<li\b/g)).toHaveLength(2);
  expect(markup).toContain("linux");
  expect(markup).toContain("android");
  expect(markup).toMatch(/>8<\/span>/);
  expect(markup).toMatch(/>2<\/span>/);
});

test("draws each bar as an svg rect as wide as its percent", () => {
  const markup = html(BarList, { rows: ROWS });
  const widths = [...markup.matchAll(/<rect\b[^>]*\swidth="(\d+)"/g)].map(
    ([, width]) => width,
  );

  expect(widths).toEqual(["100", "25"]);
});

test("hides the bars from assistive technology since the count says it", () => {
  const markup = html(BarList, { rows: ROWS });

  expect(markup.match(/<svg\b[^>]*aria-hidden="true"/g)).toHaveLength(2);
});

test("colours the bar with the accent over a chip track", () => {
  const markup = html(BarList, { rows: ROWS });

  expect(tokensOf(markup, /<rect\b[^>]*>/)).toContain("fill-accent");
  expect(markup).toContain("bg-chip");
});

test("sets the counts in tabular figures", () => {
  expect(
    tokensOf(html(BarList, { rows: ROWS }), /<span\b[^>]*tabular[^>]*>/),
  ).toContain("tabular-nums");
});

test("never draws the width with an inline style", () => {
  expect(html(BarList, { rows: ROWS })).not.toMatch(/\sstyle=/);
});

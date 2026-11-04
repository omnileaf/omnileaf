import { expect, test } from "vitest";

import { html, tokensOf, words } from "#lib/components/ui/render.ts";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./index.ts";

test("scrolls a wide table sideways inside its own container", () => {
  const markup = html(Table, { children: words("") });

  expect(tokensOf(markup, /<div\b[^>]*>/)).toEqual(
    expect.arrayContaining(["relative", "inline-full", "overflow-x-auto"]),
  );
  expect(tokensOf(markup, /<table\b[^>]*>/)).toEqual(
    expect.arrayContaining(["inline-full", "text-small"]),
  );
});

test("puts the consumer class and attributes on the table itself", () => {
  const markup = html(Table, { class: "extra", id: "reports" });

  expect(tokensOf(markup, /<table\b[^>]*>/).at(-1)).toBe("extra");
  expect(markup).toMatch(/<table\b[^>]*id="reports"/);
});

test("sets a header cell in muted 13px semibold text on the well background", () => {
  const markup = html(TableHead, { scope: "col", children: words("Code") });

  expect(markup).toContain("<th");
  expect(markup).toContain('scope="col"');
  expect(tokensOf(markup, /<th\b[^>]*>/)).toEqual(
    expect.arrayContaining([
      "bg-well",
      "text-label",
      "font-semibold",
      "text-muted",
      "text-start",
      "block-10",
      "px-4",
      "border-be",
      "border-border",
    ]),
  );
});

test("gives a body cell 14px of space above and below", () => {
  const markup = html(TableCell, { children: words("R-1111-1111") });

  expect(markup).toContain("<td");
  expect(tokensOf(markup, /<td\b[^>]*>/)).toEqual(
    expect.arrayContaining(["py-3.5", "px-4", "align-middle"]),
  );
});

test("lets the consumer class win on a cell", () => {
  const tokens = tokensOf(
    html(TableCell, { class: "py-2 extra" }),
    /<td\b[^>]*>/,
  );

  expect(tokens).toContain("py-2");
  expect(tokens).not.toContain("py-3.5");
  expect(tokens.at(-1)).toBe("extra");
});

test("separates rows with a border that the last row drops", () => {
  const markup = html(TableRow, { children: words("") });

  expect(markup).toContain("<tr");
  expect(tokensOf(markup, /<tr\b[^>]*>/)).toEqual(
    expect.arrayContaining(["border-be", "border-border", "last:border-0"]),
  );
});

test("renders the header and the body as table sections", () => {
  const header = html(TableHeader, { id: "head", children: words("") });
  const body = html(TableBody, { id: "rows", children: words("") });

  expect(header).toContain("<thead");
  expect(header).toContain('id="head"');
  expect(body).toContain("<tbody");
  expect(body).toContain('id="rows"');
});

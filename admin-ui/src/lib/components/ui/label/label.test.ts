import { expect, test } from "vitest";

import { html, tokensOf, words } from "#lib/components/ui/render.ts";

import { Label } from "./index.ts";

test("ties a label to the control it names", () => {
  const markup = html(Label, { for: "search", children: words("Search") });

  expect(markup).toContain("<label");
  expect(markup).toContain('for="search"');
  expect(markup).toContain("Search");
});

test("sets a label in small medium text", () => {
  const markup = html(Label, { children: words("Search") });

  expect(tokensOf(markup, /<label\b[^>]*>/)).toEqual(
    expect.arrayContaining(["text-small", "font-medium", "text-foreground"]),
  );
});

test("lets the consumer class win and come last", () => {
  const markup = html(Label, { class: "text-label extra" });
  const tokens = tokensOf(markup, /<label\b[^>]*>/);

  expect(tokens).toContain("text-label");
  expect(tokens).not.toContain("text-small");
  expect(tokens.at(-1)).toBe("extra");
});

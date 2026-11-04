import { expect, test } from "vitest";

import { html, tokensOf, words } from "#lib/components/ui/render.ts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./index.ts";

test("draws a card with a border, the card radius and a light shadow", () => {
  const markup = html(Card, { children: words("Body") });

  expect(tokensOf(markup, /<div\b[^>]*>/)).toEqual(
    expect.arrayContaining([
      "rounded-card",
      "border",
      "border-border",
      "bg-card",
      "text-foreground",
      "shadow-card",
      "py-5",
      "gap-4",
    ]),
  );
});

test("leaves the dark scheme to the shadow colour token", () => {
  const markup = html(Card, { children: words("Body") });

  expect(tokensOf(markup, /<div\b[^>]*>/).join(" ")).not.toContain("dark:");
});

test("lets the consumer class win and come last", () => {
  const markup = html(Card, { class: "rounded-panel extra" });
  const tokens = tokensOf(markup, /<div\b[^>]*>/);

  expect(tokens).toContain("rounded-panel");
  expect(tokens).not.toContain("rounded-card");
  expect(tokens.at(-1)).toBe("extra");
});

test("forwards native attributes to the card", () => {
  const markup = html(Card, { id: "summary", "aria-label": "Summary" });

  expect(markup).toContain('id="summary"');
  expect(markup).toContain('aria-label="Summary"');
});

test("indents the header and the content by the same amount", () => {
  const header = html(CardHeader, { children: words("") });
  const content = html(CardContent, { children: words("") });

  expect(tokensOf(header, /<div\b[^>]*>/)).toContain("px-5");
  expect(tokensOf(content, /<div\b[^>]*>/)).toContain("px-5");
});

test("sets the description in small muted text", () => {
  const markup = html(CardDescription, { children: words("Newest 500") });

  expect(markup).toContain("<p");
  expect(tokensOf(markup, /<p\b[^>]*>/)).toEqual(
    expect.arrayContaining(["text-small", "text-muted"]),
  );
});

test("titles a card with a second level heading unless told otherwise", () => {
  const markup = html(CardTitle, { children: words("Reports") });

  expect(markup).toContain("<h2");
  expect(tokensOf(markup, /<h2\b[^>]*>/)).toEqual(
    expect.arrayContaining(["text-body", "font-semibold"]),
  );
});

test("titles a card with the heading level it is given", () => {
  const markup = html(CardTitle, { level: 3, children: words("Reports") });

  expect(markup).toContain("<h3");
  expect(markup).not.toContain("<h2");
});

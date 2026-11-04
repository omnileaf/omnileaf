import { expect, test } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";

import IssueText from "./issue-text.svelte";

function render(body: string): string {
  return html(IssueText, { code: "R-0A5C-J6VN", body }).replace(
    /<!--.*?-->/gs,
    "",
  );
}

test("labels a read-only monospace text area that holds the issue text", () => {
  const markup = render("Line one\n\nLine two");

  expect(markup).toMatch(
    /<label\b[^>]*\sfor="issue-text"[^>]*>\s*Public issue text/,
  );
  expect(markup).toMatch(/<textarea\b[^>]*\sid="issue-text"/);
  expect(markup).toMatch(/<textarea\b[^>]*\sreadonly/);
  expect(markup).toMatch(/<textarea\b[^>]*>Line one\n\nLine two<\/textarea>/);
  expect(tokensOf(markup, /<textarea\b[^>]*>/)).toContain("font-mono");
});

test("tells the person to select all of it and paste it into a new issue", () => {
  const markup = render("text");

  expect(markup).toMatch(/<textarea\b[^>]*\saria-describedby="issue-hint"/);
  expect(markup).toMatch(
    /<p\b[^>]*\sid="issue-hint"[^>]*>\s*Select all of the text and paste it into a new issue\./,
  );
});

test("writes the text as text, never as markup", () => {
  const markup = render("</textarea><script>alert(1)</script>");

  expect(markup).not.toContain("<script");
  expect(markup).toContain("&lt;/textarea>");
});

test("keeps an empty polite live region ready for the confirmation", () => {
  expect(render("text")).toMatch(
    /<p\b(?=[^>]*\srole="status")(?=[^>]*\saria-live="polite")[^>]*>\s*<\/p>/,
  );
});

test("sizes the copy button and the back link for a phone and shrinks them from the tablet width", () => {
  const markup = render("text");
  const button = /<button\b[^>]*>/.exec(markup)?.[0] ?? "";
  const link = /<a\b[^>]*href="[^"]*R-0A5C-J6VN"[^>]*>/.exec(markup)?.[0] ?? "";

  for (const element of [button, link]) {
    expect(tokensOf(element, /<(button|a)\b[^>]*>/)).toEqual(
      expect.arrayContaining(["block-11", "tablet:block-9"]),
    );
  }
});

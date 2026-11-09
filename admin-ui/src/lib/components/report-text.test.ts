import { expect, test } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";

import ReportText from "./report-text.svelte";

function render(text: string | null): string {
  return html(ReportText, { text }).replace(/<!--.*?-->/gs, "");
}

test("titles the card and says the text is shown as it was sent", () => {
  const markup = render("Scan stops");

  expect(markup).toMatch(/<h2\b[^>]*>\s*Report\s*<\/h2>/);
  expect(markup).toContain(copy.report.text.hint);
});

test("keeps the line breaks and wraps long words in a monospace block", () => {
  const markup = render("Line one\n\nLine two");

  expect(markup).toMatch(/<pre\b[^>]*>Line one\n\nLine two<\/pre>/);
  expect(tokensOf(markup, /<pre\b[^>]*>/)).toEqual(
    expect.arrayContaining([
      "font-mono",
      "whitespace-pre-wrap",
      "wrap-anywhere",
    ]),
  );
});

test("writes the text as text, never as markup", () => {
  const markup = render('<img src=x onerror="alert(1)"> & more');

  expect(markup).not.toContain("<img");
  expect(markup).toContain("&lt;img src=x onerror=");
});

test("says the text was purged and shows no block once it is gone", () => {
  const markup = render(null);

  expect(markup).toContain("The text of this report has been purged.");
  expect(markup).not.toContain("<pre");
});

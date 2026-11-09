import { expect, test } from "vitest";

import { html, renderPage, tokensOf } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";

import ErrorPage from "./error-page.svelte";

function markupOf(status: number): string {
  return html(ErrorPage, { status, onRetry: () => undefined }).replace(
    /<!--.*?-->/gs,
    "",
  );
}

test("tells a visitor to an unknown address that the page was not found", () => {
  const markup = markupOf(404);

  expect(markup).toMatch(/<h1\b[^>]*>\s*Page not found\s*<\/h1>/);
  expect(markup).toContain(copy.errorPage.notFoundHint);
  expect(markup).not.toContain("Something went wrong");
});

test("offers a way back to the dashboard styled as a button as tall as the other controls", () => {
  const markup = markupOf(404);
  const link =
    /<a\b[^>]*href="\/admin\/"[^>]*>(?=\s*Back to the dashboard)/.exec(
      markup,
    )?.[0];

  expect(link).toBeDefined();
  expect(tokensOf(link ?? "", /<a\b[^>]*>/)).toEqual(
    expect.arrayContaining(["block-11", "tablet:block-9", "bg-accent"]),
  );
});

test("offers no retry for an address that does not exist", () => {
  expect(markupOf(404)).not.toContain("<button");
});

test.each([500, 502, 403])(
  "says something went wrong and offers a retry for status %i",
  (status) => {
    const markup = markupOf(status);

    expect(markup).toMatch(/<h1\b[^>]*>\s*Something went wrong\s*<\/h1>/);
    expect(markup).toContain(copy.errorPage.failedHint);
    expect(markup).toMatch(/<button\b[^>]*>\s*Try again\s*<\/button>/);
    expect(markup).toContain("Back to the dashboard");
  },
);

test.each([
  [404, "Page not found"],
  [500, "Something went wrong"],
])("titles the document of a %i page", (status, headline) => {
  const head = renderPage(ErrorPage, { status, onRetry: () => undefined }).head;

  expect(head).toContain(`<title>${headline} · Omnileaf admin</title>`);
});

test("never emits an inline style", () => {
  for (const status of [404, 500]) {
    expect(markupOf(status)).not.toMatch(/\sstyle=/);
  }
});

test("rings the way back to the dashboard when it is focused", () => {
  const link = /<a\b[^>]*href="\/admin\/"[^>]*>/.exec(markupOf(404))?.[0] ?? "";

  expect(tokensOf(link, /<a\b[^>]*>/)).toEqual(
    expect.arrayContaining([
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-accent",
    ]),
  );
});

test("draws the retry as an outline button next to the filled way back", () => {
  const retry = /<button\b[^>]*>/.exec(markupOf(500))?.[0] ?? "";
  const tokens = tokensOf(retry, /<button\b[^>]*>/);

  expect(tokens).toEqual(
    expect.arrayContaining(["border", "border-field-edge", "bg-card"]),
  );
  expect(tokens).not.toContain("bg-accent");
});

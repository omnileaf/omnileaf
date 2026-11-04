import { expect, test, vi } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";

import ReportsError from "./reports-error.svelte";

function render(): string {
  return html(ReportsError, {
    message: copy.errors.relayUnavailable,
    onRetry: vi.fn(),
  });
}

test("announces what failed and the reason in an alert", () => {
  const markup = render();

  expect(markup).toMatch(/role="alert"/);
  expect(markup).toContain(copy.reports.loadFailed);
  expect(markup).toContain(
    "The reports service did not answer. Try again in a moment.",
  );
});

test("offers a retry button", () => {
  expect(render()).toMatch(
    /<button\b[^>]*type="button"[^>]*>[\s\S]*Try again[\s\S]*<\/button>/,
  );
});

test("sizes the retry button like the other controls", () => {
  const button = /<button\b[^>]*>/.exec(render())?.[0] ?? "";

  expect(tokensOf(button, /<button\b[^>]*>/)).toEqual(
    expect.arrayContaining(["block-11", "tablet:block-9"]),
  );
});

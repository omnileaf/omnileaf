import { expect, test } from "vitest";

import { html } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";

import ReportsNoMatch from "./reports-no-match.svelte";

function render(): string {
  return html(ReportsNoMatch, { onClear: () => undefined }).replace(
    /<!--.*?-->/gs,
    "",
  );
}

test("says no report matches and what to do", () => {
  const markup = render();

  expect(markup).toMatch(/<h2\b[^>]*>\s*No reports match\s*<\/h2>/);
  expect(markup).toContain(copy.reports.noMatchHint);
});

test("offers a button that clears the filters", () => {
  expect(render()).toMatch(
    /<button\b[^>]*type="button"[^>]*>\s*Clear filters\s*<\/button>/,
  );
});

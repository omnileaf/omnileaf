import { expect, test } from "vitest";

import { html } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";

import ReportsEmpty from "./reports-empty.svelte";

test("says there are no reports yet and where they will appear", () => {
  const markup = html(ReportsEmpty, {});

  expect(markup).toMatch(/<h2\b[^>]*>[\s\S]*No reports yet[\s\S]*<\/h2>/);
  expect(markup).toContain(copy.reports.noneHint);
});

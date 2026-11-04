import { expect, test, vi } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";
import type { MoveRecovery } from "#lib/move-failure.ts";

import MoveProblem from "./move-problem.svelte";
import { WRAPPING_LABEL } from "./wrapping-label.ts";

function note(recoveries: readonly MoveRecovery[]): string {
  return html(MoveProblem, {
    message: "A published report cannot be moved to closed.",
    recoveries,
    onRetry: vi.fn(),
    onReload: vi.fn(),
  }).replace(/<!--.*?-->/gs, "");
}

function labels(markup: string): string[] {
  return [...markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(
    ([, inner = ""]) => inner.replace(/<[^>]*>/g, "").trim(),
  );
}

test("is a note that gets focus and is named and described by its own words", () => {
  const markup = note(["reload"]);

  expect(markup).toMatch(
    /<div\b(?=[^>]*\sid="move-problem")(?=[^>]*\stabindex="-1")(?=[^>]*\srole="note")(?=[^>]*\saria-labelledby="move-problem-title")(?=[^>]*\saria-describedby="move-problem-message")[^>]*>/,
  );
  expect(markup).toMatch(
    /<p\b[^>]*\sid="move-problem-title"[^>]*>\s*Could not move this report/,
  );
  expect(markup).toMatch(
    /<p\b[^>]*\sid="move-problem-message"[^>]*>\s*A published report cannot be moved to closed\./,
  );
});

test("is not announced as an alert on top of taking focus", () => {
  expect(note(["reload"])).not.toContain('role="alert"');
});

test("keeps the focus ring", () => {
  const markup = note([]);

  expect(markup).not.toContain("outline-none");
  expect(tokensOf(markup, /<div\b[^>]*\sid="move-problem"[^>]*>/)).toEqual(
    expect.arrayContaining(["focus-visible:outline-2"]),
  );
});

test.each([
  [["reload"], ["Reload report"]],
  [["retry"], ["Try again"]],
  [
    ["reload", "retry"],
    ["Reload report", "Try again"],
  ],
  [[], []],
] as const)("offers %j, in that order", (recoveries, expected) => {
  expect(labels(note(recoveries))).toEqual(expected);
});

test("lets the label of every way out wrap and keeps the touch size", () => {
  const markup = note(["reload", "retry"]);
  const found = [...markup.matchAll(/<button\b[^>]*>/g)];

  expect(found).toHaveLength(2);
  for (const [button = ""] of found) {
    const tokens = tokensOf(button, /<button\b[^>]*>/);

    expect(tokens).toEqual(expect.arrayContaining(WRAPPING_LABEL.split(" ")));
    expect(tokens).not.toContain("whitespace-nowrap");
    expect(tokens).not.toContain("block-11");
    expect(tokens).not.toContain("tablet:block-8");
    expect(tokens).not.toContain("tablet:block-9");
    expect(tokens).toContain("px-4");
    expect(tokens).not.toContain("px-3");
  }
});

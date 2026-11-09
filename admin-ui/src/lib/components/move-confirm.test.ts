import { expect, test, vi } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";

import MoveConfirm from "./move-confirm.svelte";
import { WRAPPING_LABEL } from "./wrapping-label.ts";

const CODE = "R-3H7W-P9ZD";

function panel(status: "published" | "duplicate" = "published"): string {
  return html(MoveConfirm, {
    code: CODE,
    request: { status, issue: 430 },
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  }).replace(/<!--.*?-->/gs, "");
}

function buttons(markup: string) {
  return [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(
    ([, attributes = "", inner = ""]) => ({
      label: inner.replace(/<[^>]*>/g, "").trim(),
      attributes,
    }),
  );
}

test.each([
  ["published", "Mark R-3H7W-P9ZD as Published, issue #430?"],
  ["duplicate", "Mark R-3H7W-P9ZD as Duplicate, issue #430?"],
] as const)(
  "asks the question for a move to %s in a labelled group",
  (status, question) => {
    const markup = panel(status);

    expect(markup).toMatch(
      /<div\b[^>]*\srole="group"[^>]*\saria-labelledby="move-confirm-question"/,
    );
    expect(markup).toMatch(
      new RegExp(
        `<p\\b[^>]*\\sid="move-confirm-question"[^>]*\\stabindex="-1"[^>]*>\\s*${question}`,
      ),
    );
  },
);

test("ties the warning to the question that gets focus", () => {
  const markup = panel();

  expect(markup).toMatch(
    /<p\b(?=[^>]*\sid="move-confirm-question")(?=[^>]*\saria-describedby="move-confirm-hint")[^>]*>/,
  );
  expect(markup).toMatch(
    /<p\b[^>]*\sid="move-confirm-hint"[^>]*>\s*This cannot be changed afterwards\./,
  );
});

test("keeps the focus ring on the question", () => {
  expect(
    tokensOf(panel(), /<p\b[^>]*\sid="move-confirm-question"[^>]*>/),
  ).toEqual(expect.arrayContaining(["focus-visible:outline-2"]));
});

test("offers to cancel or to confirm with the status named", () => {
  const offered = buttons(panel("duplicate"));

  expect(offered.map((button) => button.label)).toEqual([
    "Cancel",
    "Mark as Duplicate",
  ]);
  for (const { attributes } of offered) {
    expect(attributes).toContain('type="button"');
    expect(tokensOf(`<button${attributes}>`, /<button\b[^>]*>/)).toEqual(
      expect.arrayContaining(["min-block-11", "tablet:min-block-9"]),
    );
  }
});

test.each(["published", "duplicate"] as const)(
  "lets the label of the %s button wrap and keeps the touch size",
  (status) => {
    for (const { attributes } of buttons(panel(status))) {
      const tokens = tokensOf(`<button${attributes}>`, /<button\b[^>]*>/);

      expect(tokens).toEqual(expect.arrayContaining(WRAPPING_LABEL.split(" ")));
      expect(tokens).not.toContain("whitespace-nowrap");
      expect(tokens).not.toContain("block-11");
      expect(tokens).not.toContain("tablet:block-9");
    }
  },
);

test("stacks the two buttons full width on a phone and sets them side by side from the tablet width", () => {
  const tokens = tokensOf(
    panel(),
    /<div\b[^>]*\sclass="[^"]*\bgrid\b[^"]*"[^>]*>/,
  );

  expect(tokens).toEqual(
    expect.arrayContaining(["grid", "tablet:grid-cols-2"]),
  );
  expect(tokens).not.toContain("grid-cols-2");
});

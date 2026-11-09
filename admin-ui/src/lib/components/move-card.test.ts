import { expect, test, vi } from "vitest";

import { html, tokensOf } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";
import type { MoveState } from "#lib/move-state.ts";
import { allowedMoves, MOVE_TARGETS } from "#lib/moves.ts";
import { STATUS_KINDS, type Status, type StatusKind } from "#lib/wire.ts";

import MoveCard from "./move-card.svelte";
import { WRAPPING_LABEL } from "./wrapping-label.ts";
import type { MoveProps } from "#lib/move-props.ts";

const CODE = "R-3H7W-P9ZD";
const INPUT_DISABLED = /<input\b[^>]*\sdisabled(?=[=\s/>])/;
const MOVE_LABELS = ["Reviewing", "Published", "Duplicate", "Closed"] as const;

function statusOf(kind: StatusKind): Status {
  return kind === "published" || kind === "duplicate"
    ? { kind, issue: 412 }
    : { kind };
}

function moveProps(state: MoveState, draft: string): MoveProps {
  return {
    state,
    draft,
    onDraftChange: vi.fn(),
    onChoose: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    onReload: vi.fn(),
  };
}

function card(
  kind: StatusKind,
  state: MoveState = { kind: "idle" },
  draft = "",
): string {
  return html(MoveCard, {
    code: CODE,
    status: statusOf(kind),
    move: moveProps(state, draft),
  }).replace(/<!--.*?-->/gs, "");
}

function buttons(markup: string) {
  return [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(
    ([, attributes = "", inner = ""]) => ({
      label: inner.replace(/<[^>]*>/g, "").trim(),
      disabled: /\sdisabled(?=[=\s/>])/.test(attributes),
      attributes,
    }),
  );
}

const MOVABLE = STATUS_KINDS.filter((kind) => allowedMoves(kind).length > 0);
const FINAL = STATUS_KINDS.filter((kind) => allowedMoves(kind).length === 0);

test("titles the card and says to pick the status it should have now", () => {
  const markup = card("received");

  expect(markup).toMatch(/<h2\b[^>]*>\s*Move this report\s*<\/h2>/);
  expect(markup).toContain(copy.moves.hint);
});

test.each(MOVABLE)("enables only the moves a %s report can make", (kind) => {
  const moves = buttons(card(kind));

  expect(moves.map((move) => move.label)).toEqual([...MOVE_LABELS]);
  expect(
    moves.filter((move) => !move.disabled).map((move) => move.label),
  ).toEqual(allowedMoves(kind).map((target) => copy.status[target]));
});

test.each(FINAL)("says a %s report is final and offers no moves", (kind) => {
  const markup = card(kind);

  expect(buttons(markup)).toEqual([]);
  expect(markup).not.toContain("<input");
  expect(markup).toMatch(/role="note"[\s\S]*This report is final/);
  expect(markup).toContain(copy.moves.finalHint);
});

test("labels the issue number field and says when it is needed", () => {
  const markup = card("reviewing");

  expect(markup).toMatch(
    /<label\b[^>]*\sfor="move-issue"[^>]*>\s*Issue number/,
  );
  expect(markup).toMatch(/<input\b[^>]*\sid="move-issue"/);
  expect(markup).toMatch(/<input\b[^>]*\sinputmode="numeric"/);
  expect(markup).toMatch(/<input\b[^>]*\saria-describedby="move-issue-hint"/);
  expect(markup).toMatch(
    /<p\b[^>]*\sid="move-issue-hint"[^>]*>\s*Needed for Published and Duplicate\./,
  );
});

test("fills the issue number field with the number typed before a confirmation was cancelled", () => {
  const markup = card("reviewing", { kind: "idle" }, "430");

  expect(markup).toMatch(/<input\b[^>]*\svalue="430"/);
});

test("leaves the issue number field empty when nothing was typed", () => {
  expect(card("reviewing")).not.toMatch(/<input\b[^>]*\svalue="[^"]/);
});

test("disables the issue number field when neither move that needs it is open", () => {
  expect(card("closed")).toMatch(INPUT_DISABLED);
  expect(card("received")).not.toMatch(INPUT_DISABLED);
});

test("says why only Reviewing is open on a closed report", () => {
  expect(card("closed")).toContain(copy.moves.closedHint);
  expect(card("reviewing")).not.toContain(copy.moves.closedHint);
});

test("disables every control while a move is pending", () => {
  const markup = card("received", { kind: "pending" });

  expect(buttons(markup).every((move) => move.disabled)).toBe(true);
  expect(markup).toMatch(INPUT_DISABLED);
});

test("ties the issue message to the field it is about", () => {
  const markup = card("reviewing", {
    kind: "issueInvalid",
    message:
      "Enter the issue number to mark this report published. Use a whole number above zero.",
  });

  expect(markup).toMatch(/<input\b[^>]*\saria-invalid="true"/);
  expect(markup).toMatch(
    /<input\b[^>]*\saria-describedby="move-issue-hint move-issue-error"/,
  );
  expect(markup).toMatch(
    /<p\b[^>]*\sid="move-issue-error"[^>]*>\s*Enter the issue number to mark this report published\. Use a whole number above zero\./,
  );
});

test("marks nothing invalid and writes no issue message at rest", () => {
  const markup = card("reviewing");

  expect(markup).not.toContain('aria-invalid="');
  expect(markup).not.toContain("move-issue-error");
});

test.each([
  ["published", "Mark R-3H7W-P9ZD as Published, issue #430?"],
  ["duplicate", "Mark R-3H7W-P9ZD as Duplicate, issue #430?"],
] as const)("asks before a move to %s", (status, question) => {
  const markup = card("reviewing", {
    kind: "confirming",
    request: { status, issue: 430 },
  });

  expect(markup).toMatch(
    /role="group"[^>]*aria-labelledby="move-confirm-question"/,
  );
  expect(markup).toMatch(
    new RegExp(
      `<p\\b[^>]*\\sid="move-confirm-question"[^>]*\\stabindex="-1"[^>]*>\\s*${question}`,
    ),
  );
  expect(markup).toMatch(
    /<p\b(?=[^>]*\sid="move-confirm-question")(?=[^>]*\saria-describedby="move-confirm-hint")[^>]*>/,
  );
  expect(markup).toMatch(
    /<p\b[^>]*\sid="move-confirm-hint"[^>]*>\s*This cannot be changed afterwards\./,
  );
  expect(buttons(markup).map((button) => button.label)).toEqual([
    "Cancel",
    `Mark as ${copy.status[status]}`,
  ]);
  expect(buttons(markup).some((button) => button.disabled)).toBe(false);
  expect(markup).not.toContain("<input");
});

const PROBLEM: MoveState = {
  kind: "problem",
  message: "A published report cannot be moved to closed.",
  recoveries: ["reload"],
  request: { status: "closed" },
};

test("shows a failed move in a note that gets focus and is named by its words", () => {
  const markup = card("reviewing", PROBLEM);

  expect(markup).toMatch(
    /<div\b(?=[^>]*\sid="move-problem")(?=[^>]*\stabindex="-1")(?=[^>]*\srole="note")(?=[^>]*\saria-labelledby="move-problem-title")(?=[^>]*\saria-describedby="move-problem-message")[^>]*>/,
  );
  expect(markup).toMatch(
    /<p\b[^>]*\sid="move-problem-title"[^>]*>\s*Could not move this report/,
  );
  expect(markup).toMatch(
    /<p\b[^>]*\sid="move-problem-message"[^>]*>\s*A published report cannot be moved to closed\./,
  );
  expect(markup).not.toContain('role="alert"');
  expect(markup.indexOf("Could not move")).toBeLessThan(
    markup.indexOf("move-issue"),
  );
});

test("keeps the focus ring on the failed move note", () => {
  const markup = card("reviewing", PROBLEM);

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
] as const)(
  "offers %j after a failed move, in that order",
  (recoveries, labels) => {
    const markup = card("reviewing", { ...PROBLEM, recoveries });
    const offered = buttons(markup)
      .map((button) => button.label)
      .filter((name) => name === "Try again" || name === "Reload report");

    expect(offered).toEqual(labels);
  },
);

test("keeps a status line in the card that gets focus and is read out politely", () => {
  const markup = card("reviewing");

  expect(markup).toMatch(
    /<p\b(?=[^>]*\sid="move-status")(?=[^>]*\stabindex="-1")(?=[^>]*\srole="status")(?=[^>]*\saria-live="polite")[^>]*>\s*<\/p>/,
  );
});

test.each([
  [{ kind: "pending" }, "Moving this report."],
  [{ kind: "reloading" }, "Loading this report again."],
  [{ kind: "moved", announcement: "Moved to Closed." }, "Moved to Closed."],
] as const satisfies readonly (readonly [MoveState, string])[])(
  "says %j in the status line",
  (state, words) => {
    const markup = card("closed", state);

    expect(markup).toMatch(
      new RegExp(`<p\\b[^>]*\\sid="move-status"[^>]*>\\s*${words}\\s*</p>`),
    );
  },
);

test("keeps the status line in the card whichever panel is showing", () => {
  for (const state of [
    { kind: "confirming", request: { status: "published", issue: 1 } },
    PROBLEM,
    { kind: "pending" },
  ] as const) {
    expect(card("reviewing", state)).toContain('id="move-status"');
  }
  expect(card("published", { kind: "moved", announcement: "x" })).toContain(
    'id="move-status"',
  );
});

test("disables every control while the report is reloading", () => {
  const markup = card("received", { kind: "reloading" });

  expect(buttons(markup).every((move) => move.disabled)).toBe(true);
  expect(markup).toMatch(INPUT_DISABLED);
});

test("sizes every button for a phone and shrinks it from the tablet width", () => {
  for (const state of [
    { kind: "idle" },
    { kind: "confirming", request: { status: "published", issue: 1 } },
  ] as const) {
    const markup = card("reviewing", state);
    expect(buttons(markup).length).toBeGreaterThan(0);
    for (const { attributes } of buttons(markup)) {
      expect(tokensOf(`<button${attributes}>`, /<button\b[^>]*>/)).toEqual(
        expect.arrayContaining(["min-block-11", "tablet:min-block-9"]),
      );
    }
  }
});

test("makes every move button a plain button so it never submits a form", () => {
  const moves = buttons(card("received"));

  expect(moves).toHaveLength(MOVE_LABELS.length);
  for (const { attributes } of moves) {
    expect(attributes).toContain('type="button"');
  }
});

test("offers a move to every status but the one a report starts in, in the order of the buttons", () => {
  expect(MOVE_TARGETS).toEqual([
    "reviewing",
    "published",
    "duplicate",
    "closed",
  ]);
});

test("hides the empty status line from the eye but keeps it for assistive technology", () => {
  const markup = card("reviewing");

  expect(tokensOf(markup, /<p\b[^>]*\sid="move-status"[^>]*>/)).toEqual(
    expect.arrayContaining(["sr-only"]),
  );
});

test("shows the status line once it has something to say", () => {
  const tokens = tokensOf(
    card("closed", { kind: "pending" }),
    /<p\b[^>]*\sid="move-status"[^>]*>/,
  );

  expect(tokens).toEqual(expect.arrayContaining(["mbe-3", "text-muted"]));
  expect(tokens).not.toContain("sr-only");
});

test("lets the label of every move button wrap and keeps the touch size", () => {
  const moves = buttons(card("received"));

  expect(moves).toHaveLength(MOVE_LABELS.length);
  for (const { attributes } of moves) {
    const tokens = tokensOf(`<button${attributes}>`, /<button\b[^>]*>/);

    expect(tokens).toEqual(expect.arrayContaining(WRAPPING_LABEL.split(" ")));
    expect(tokens).not.toContain("whitespace-nowrap");
    expect(tokens).not.toContain("block-11");
    expect(tokens).not.toContain("tablet:block-9");
  }
});

test("sets the four move buttons in two columns that may shrink to fit", () => {
  const tokens = tokensOf(
    card("received"),
    /<div\b(?=[^>]*\sclass="[^"]*\bgrid-cols-2\b)[^>]*>/,
  );

  expect(tokens).toEqual(
    expect.arrayContaining(["grid", "grid-cols-2", "gap-2"]),
  );
});

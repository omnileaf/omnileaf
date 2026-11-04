import {
  CONFIRM_QUESTION_ID,
  ISSUE_FIELD_ID,
  moveButtonId,
  PROBLEM_ID,
  STATUS_ID,
} from "#lib/move-ids.ts";
import type { MoveState } from "#lib/move-state.ts";

export type MoveFocus =
  | { readonly kind: "heading" }
  | { readonly kind: "element"; readonly id: string };

function element(id: string): MoveFocus {
  return { kind: "element", id };
}

export function focusAfter(
  previous: MoveState,
  next: MoveState,
): MoveFocus | undefined {
  switch (next.kind) {
    case "confirming":
      return element(CONFIRM_QUESTION_ID);
    case "issueInvalid":
      return element(ISSUE_FIELD_ID);
    case "problem":
      return element(PROBLEM_ID);
    case "pending":
    case "reloading":
    case "moved":
      return element(STATUS_ID);
    case "idle":
      if (previous.kind === "confirming") {
        return element(moveButtonId(previous.request.status));
      }
      return previous.kind === "reloading" ? { kind: "heading" } : undefined;
  }
}

export class MoveFocusTracker {
  readonly #focus: (target: MoveFocus) => void;
  readonly #settle: () => Promise<void>;
  #previous: MoveState = { kind: "idle" };

  constructor(focus: (target: MoveFocus) => void, settle: () => Promise<void>) {
    this.#focus = focus;
    this.#settle = settle;
  }

  async observe(state: MoveState): Promise<void> {
    const target = focusAfter(this.#previous, state);
    this.#previous = state;
    if (target !== undefined) {
      await this.#settle();
      this.#focus(target);
    }
  }
}

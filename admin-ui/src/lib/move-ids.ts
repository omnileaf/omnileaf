import type { MoveTarget } from "#lib/wire.ts";

export const ISSUE_FIELD_ID = "move-issue";
export const ISSUE_HINT_ID = "move-issue-hint";
export const ISSUE_ERROR_ID = "move-issue-error";
export const CONFIRM_QUESTION_ID = "move-confirm-question";
export const CONFIRM_HINT_ID = "move-confirm-hint";
export const PROBLEM_ID = "move-problem";
export const PROBLEM_TITLE_ID = "move-problem-title";
export const PROBLEM_MESSAGE_ID = "move-problem-message";
export const STATUS_ID = "move-status";

export function moveButtonId(target: MoveTarget): string {
  return `move-${target}`;
}

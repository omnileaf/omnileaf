import { copy } from "#lib/copy.ts";
import { fillTemplate } from "#lib/template.ts";
import {
  isIssueStatusKind,
  type IssueStatusKind,
  type MoveRequest,
  type MoveTarget,
  type Status,
  type StatusKind,
} from "#lib/wire.ts";

export type IssueMoveRequest = Extract<MoveRequest, { issue: number }>;

export type MovePlan =
  | { readonly kind: "send"; readonly request: MoveRequest }
  | { readonly kind: "confirm"; readonly request: IssueMoveRequest }
  | { readonly kind: "issueNeeded"; readonly message: string };

const ALLOWED_MOVES = {
  received: ["reviewing", "published", "duplicate", "closed"],
  reviewing: ["published", "duplicate", "closed"],
  published: [],
  duplicate: [],
  closed: ["reviewing"],
} as const satisfies Record<StatusKind, readonly MoveTarget[]>;

const ISSUE_NUMBER = /^#?([0-9]+)$/;

export function allowedMoves(from: StatusKind): readonly MoveTarget[] {
  return ALLOWED_MOVES[from];
}

export function statusOf(request: MoveRequest): Status {
  return "issue" in request
    ? { kind: request.status, issue: request.issue }
    : { kind: request.status };
}

export function needsIssue(target: MoveTarget): target is IssueStatusKind {
  return isIssueStatusKind(target);
}

export function parseIssueNumber(text: string): number | undefined {
  const digits = ISSUE_NUMBER.exec(text.trim())?.[1];
  if (digits === undefined) {
    return undefined;
  }
  const issue = Number(digits);
  return Number.isSafeInteger(issue) && issue > 0 ? issue : undefined;
}

export function planMove(target: MoveTarget, issueText: string): MovePlan {
  if (!needsIssue(target)) {
    return { kind: "send", request: { status: target } };
  }
  const issue = parseIssueNumber(issueText);
  return issue === undefined
    ? { kind: "issueNeeded", message: issueNeededMessage(target) }
    : { kind: "confirm", request: { status: target, issue } };
}

export function issueNeededMessage(target: IssueStatusKind): string {
  return fillTemplate(copy.moves.issueNeeded, { status: target });
}

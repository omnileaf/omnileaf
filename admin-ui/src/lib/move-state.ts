import { copy } from "#lib/copy.ts";
import type { MoveRecovery } from "#lib/move-failure.ts";
import type { IssueMoveRequest } from "#lib/moves.ts";
import type { MoveRequest } from "#lib/wire.ts";

export type MoveState =
  | { readonly kind: "idle" }
  | { readonly kind: "issueInvalid"; readonly message: string }
  | { readonly kind: "confirming"; readonly request: IssueMoveRequest }
  | { readonly kind: "pending" }
  | { readonly kind: "reloading" }
  | {
      readonly kind: "problem";
      readonly message: string;
      readonly recoveries: readonly MoveRecovery[];
      readonly request: MoveRequest;
    }
  | { readonly kind: "moved"; readonly announcement: string };

export function isBusy(state: MoveState): boolean {
  return state.kind === "pending" || state.kind === "reloading";
}

export function statusText(state: MoveState): string {
  switch (state.kind) {
    case "pending":
      return copy.moves.moving;
    case "reloading":
      return copy.moves.reloading;
    case "moved":
      return state.announcement;
    case "idle":
    case "issueInvalid":
    case "confirming":
    case "problem":
      return "";
  }
}

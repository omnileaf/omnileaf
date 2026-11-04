import type { ApiError } from "#lib/api.ts";
import { copy } from "#lib/copy.ts";
import { describeError } from "#lib/error-copy.ts";
import { issueNeededMessage, needsIssue } from "#lib/moves.ts";
import { fillTemplate } from "#lib/template.ts";
import type { MoveTarget } from "#lib/wire.ts";

export type MoveRecovery = "reload" | "retry";

export type MoveFailure =
  | { readonly kind: "issue"; readonly message: string }
  | {
      readonly kind: "alert";
      readonly message: string;
      readonly recoveries: readonly MoveRecovery[];
    };

function alert(
  message: string,
  recoveries: readonly MoveRecovery[],
): MoveFailure {
  return { kind: "alert", message, recoveries };
}

export function moveFailure(error: ApiError, target: MoveTarget): MoveFailure {
  switch (error.kind) {
    case "refused":
      return alert(
        fillTemplate(copy.moves.refused, {
          from: error.from,
          status: target,
        }),
        ["reload"],
      );
    case "issueRequired":
      return needsIssue(target)
        ? { kind: "issue", message: issueNeededMessage(target) }
        : alert(describeError(error), ["retry"]);
    case "notFound":
      return alert(copy.moves.gone, ["reload"]);
    case "csrfRejected":
    case "signedOut":
      return alert(describeError(error), []);
    case "timeout":
    case "networkFailure":
    case "unexpectedReply":
      return alert(describeError(error), ["reload", "retry"]);
    case "relayUnavailable":
    case "methodNotAllowed":
    case "badRequest":
      return alert(describeError(error), ["retry"]);
  }
}

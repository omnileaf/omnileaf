import type { ApiError } from "#lib/api.ts";
import { copy } from "#lib/copy.ts";

export function describeError(error: ApiError): string {
  switch (error.kind) {
    case "relayUnavailable":
    case "timeout":
    case "networkFailure":
    case "signedOut":
    case "csrfRejected":
      return copy.errors[error.kind];
    case "notFound":
    case "methodNotAllowed":
    case "badRequest":
    case "issueRequired":
    case "refused":
    case "unexpectedReply":
      return copy.errors.unexpected;
  }
}

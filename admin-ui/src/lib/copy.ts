import type { StatusKind } from "#lib/wire.ts";

export const copy = {
  appName: "Omnileaf reports",
  breadcrumb: "Breadcrumb",
  status: {
    received: "Received",
    reviewing: "Reviewing",
    published: "Published",
    duplicate: "Duplicate",
    closed: "Closed",
  } satisfies Record<StatusKind, string>,
  errors: {
    relayUnavailable:
      "The reports service did not answer. Try again in a moment.",
    timeout:
      "The reports service took too long to answer. Try again in a moment.",
    networkFailure:
      "The admin service could not be reached. Check the connection and try again in a moment.",
    signedOut: "Your session has ended. Sign in again.",
    csrfRejected: "Your session is out of date. Reload the page and try again.",
    unexpected: "Something went wrong. Try again in a moment.",
  },
} as const;

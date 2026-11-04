import type { StatusKind } from "#lib/wire.ts";

export const copy = {
  appName: "Omnileaf reports",
  adminName: "Omnileaf admin",
  breadcrumb: "Breadcrumb",
  status: {
    received: "Received",
    reviewing: "Reviewing",
    published: "Published",
    duplicate: "Duplicate",
    closed: "Closed",
  } satisfies Record<StatusKind, string>,
  shell: {
    skipLink: "Skip to the content",
    mainNav: "Main",
    dashboard: "Dashboard",
    reports: "Reports",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    retry: "Try again",
    signingIn: "Signing in",
    signingInHint: "Taking you to the sign-in page.",
    sessionFailed: "Could not open your session",
    signOutFailed: "Could not sign out",
  },
  errorPage: {
    notFound: "Page not found",
    notFoundHint:
      "There is no page at this address. Check the link or go back to the dashboard.",
    failed: "Something went wrong",
    failedHint: "The page could not be shown. Try again in a moment.",
    backToDashboard: "Back to the dashboard",
  },
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

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
} as const;

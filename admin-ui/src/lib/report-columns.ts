import { copy } from "#lib/copy.ts";

export type ReportColumn = "status" | "platform" | "version" | "received";

export const REPORT_COLUMN_HEADERS = {
  status: copy.reportColumns.status,
  platform: copy.reportColumns.platform,
  version: copy.reportColumns.version,
  received: copy.reportColumns.received,
} as const satisfies Record<ReportColumn, string>;

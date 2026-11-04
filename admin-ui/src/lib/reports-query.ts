import type { ReportFilter } from "#lib/reports.ts";

export type Query = "" | `?${string}`;

export function filterToQuery(filter: ReportFilter): Query {
  const parameters = new URLSearchParams();
  const entries = [
    ["q", filter.search],
    ["status", filter.status],
    ["platform", filter.platform],
    ["version", filter.version],
  ] as const;
  for (const [name, value] of entries) {
    if (value !== undefined && value.trim() !== "") {
      parameters.set(name, value);
    }
  }
  const query = parameters.toString();
  return query === "" ? "" : `?${query}`;
}

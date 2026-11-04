import type { ReportFilter } from "#lib/reports.ts";

export function filterToQuery(filter: ReportFilter): string {
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

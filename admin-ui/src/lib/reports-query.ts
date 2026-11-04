import type { ReportFilter } from "#lib/reports.ts";
import { isStatusKind } from "#lib/wire.ts";

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

function present(value: string | null): string | undefined {
  return value === null || value === "" ? undefined : value;
}

export function queryToFilter(parameters: URLSearchParams): ReportFilter {
  const search = present(parameters.get("q"));
  const status = present(parameters.get("status"));
  const platform = present(parameters.get("platform"));
  const version = present(parameters.get("version"));
  return {
    ...(search === undefined ? {} : { search }),
    ...(status !== undefined && isStatusKind(status) ? { status } : {}),
    ...(platform === undefined ? {} : { platform }),
    ...(version === undefined ? {} : { version }),
  };
}

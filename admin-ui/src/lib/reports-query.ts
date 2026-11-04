import type { ReportFilter } from "#lib/reports.ts";
import { isStatusKind } from "#lib/wire.ts";

export type Query = "" | `?${string}`;

const FILTER_PARTS = ["search", "status", "platform", "version"] as const;

export type FilterPart = (typeof FILTER_PARTS)[number];

const PARAMETER = {
  search: "q",
  status: "status",
  platform: "platform",
  version: "version",
} as const satisfies Record<FilterPart, string>;

export function filterToQuery(filter: ReportFilter): Query {
  const parameters = new URLSearchParams();
  for (const part of FILTER_PARTS) {
    const value = filter[part];
    if (value !== undefined && value.trim() !== "") {
      parameters.set(PARAMETER[part], value);
    }
  }
  const query = parameters.toString();
  return query === "" ? "" : `?${query}`;
}

type FilterParts = Readonly<Record<FilterPart, string | undefined>>;

function buildFilter(parts: FilterParts): ReportFilter {
  const { search, status } = parts;
  const platform = parts.platform?.trim();
  const version = parts.version?.trim();
  return {
    ...(search === undefined || search === "" ? {} : { search }),
    ...(isStatusKind(status) ? { status } : {}),
    ...(platform === undefined || platform === "" ? {} : { platform }),
    ...(version === undefined || version === "" ? {} : { version }),
  };
}

export function queryToFilter(
  parameters: Pick<URLSearchParams, "get">,
): ReportFilter {
  return buildFilter({
    search: parameters.get(PARAMETER.search) ?? undefined,
    status: parameters.get(PARAMETER.status) ?? undefined,
    platform: parameters.get(PARAMETER.platform) ?? undefined,
    version: parameters.get(PARAMETER.version) ?? undefined,
  });
}

export function changeFilter(
  filter: ReportFilter,
  part: FilterPart,
  value: string,
): ReportFilter {
  return buildFilter({
    search: filter.search,
    status: filter.status,
    platform: filter.platform,
    version: filter.version,
    [part]: value,
  });
}

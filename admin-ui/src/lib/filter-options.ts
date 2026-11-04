import { compareVersions } from "#lib/reports.ts";
import type { Listed } from "#lib/wire.ts";

export interface FilterOptions {
  readonly platforms: readonly string[];
  readonly versions: readonly string[];
}

const compareText = new Intl.Collator("en").compare;

function unique(values: readonly (string | undefined)[]): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string => value !== undefined && value !== "",
      ),
    ),
  ];
}

export function filterOptions(
  reports: readonly Listed[],
  selected: { readonly platform?: string; readonly version?: string },
): FilterOptions {
  return {
    platforms: unique([
      ...reports.map((report) => report.platform),
      selected.platform,
    ]).sort(compareText),
    versions: unique([
      ...reports.map((report) => report.version),
      selected.version,
    ]).sort((a, b) => compareVersions(b, a)),
  };
}

import { copy } from "#lib/copy.ts";
import { fillTemplate } from "#lib/template.ts";

export type ListScope = "all" | "newest";

const plurals = new Intl.PluralRules("en");

function counted(forms: { one: string; other: string }, count: number): string {
  return plurals.select(count) === "one" ? forms.one : forms.other;
}

export function resultsSummary(
  shown: number,
  total: number,
  scope: ListScope,
): string {
  const values = { shown, total };
  if (scope === "newest") {
    return fillTemplate(
      shown === total
        ? copy.reports.summary.newest
        : copy.reports.summary.someOfNewest,
      values,
    );
  }
  return fillTemplate(
    counted(
      shown === total
        ? copy.reports.summary.all
        : copy.reports.summary.someOfAll,
      total,
    ),
    values,
  );
}

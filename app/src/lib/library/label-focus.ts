import type { SeriesLabels } from "#lib/ipc/bindings.ts";

import type { LabelsFrom } from "./series-selection";

export type LabelField = "category" | "tag";

function hasTagsToPick(labels: SeriesLabels): boolean {
  return labels.tags.length > 0 || labels.suggestedTags.length > 0;
}

export function fieldToFocus(
  labels: SeriesLabels,
  from: LabelsFrom,
): LabelField | undefined {
  if (from === "tags") {
    return hasTagsToPick(labels) ? undefined : "tag";
  }
  return labels.categories.length > 0 ? undefined : "category";
}

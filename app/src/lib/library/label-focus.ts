import type { SeriesLabels } from "#lib/ipc/bindings.ts";

import type { LabelsFrom } from "./series-selection";

export type LabelFields = Readonly<Record<LabelsFrom, HTMLInputElement | null>>;

export function hasNothingToPick(
  labels: SeriesLabels,
  from: LabelsFrom,
): boolean {
  return from === "tags"
    ? labels.tags.length === 0 && labels.suggestedTags.length === 0
    : labels.categories.length === 0;
}

export function focusFieldWhenNothingToPick(
  labels: SeriesLabels,
  from: LabelsFrom,
  fields: () => LabelFields,
): void {
  if (hasNothingToPick(labels, from)) {
    requestAnimationFrame(() => {
      fields()[from]?.focus();
    });
  }
}

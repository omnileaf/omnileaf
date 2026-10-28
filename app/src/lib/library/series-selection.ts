import { getContext, setContext } from "svelte";

import type { SeriesId } from "#lib/series/series-id.ts";
import type { Selection } from "#lib/page/selection.svelte.ts";

export type LabelsFrom = "categories" | "tags";

const SERIES_SELECTION = Symbol("series selection");

export function setSeriesSelection(selection: Selection<SeriesId>): void {
  setContext(SERIES_SELECTION, selection);
}

export function seriesSelection(): Selection<SeriesId> | undefined {
  return getContext<Selection<SeriesId> | undefined>(SERIES_SELECTION);
}

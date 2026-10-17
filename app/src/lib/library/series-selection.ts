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

const RELEASE_MS = 600;
let held: { readonly series: SeriesId; readonly at: number } | undefined;

export function noteHeld(series: SeriesId): void {
  held = { series, at: performance.now() };
}

export function isReleaseOfHold(series: SeriesId, event: MouseEvent): boolean {
  const isRelease =
    held?.series === series && event.timeStamp - held.at < RELEASE_MS;
  held = undefined;
  return isRelease;
}

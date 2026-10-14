import type { SeriesOverview } from "#lib/ipc/bindings.ts";
import { hasIdShape } from "#lib/ipc/id-shape.ts";

export type SeriesId = SeriesOverview["id"];

function isSeriesId(text: string): text is SeriesId {
  return hasIdShape(text);
}

export function seriesIdIn(text: string): SeriesId | undefined {
  return isSeriesId(text) ? text : undefined;
}

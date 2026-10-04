import type { SeriesOverview } from "#lib/ipc/bindings.ts";
import { hasIdShape } from "#lib/ipc/id-shape.ts";

export type SeriesId = SeriesOverview["id"];

/** Takes an id back from a page address the app made from it. */
function isSeriesId(text: string): text is SeriesId {
  return hasIdShape(text);
}

/** The series a page address names, or nothing for text that can't be an id the core gave out. */
export function seriesIdIn(text: string): SeriesId | undefined {
  return isSeriesId(text) ? text : undefined;
}

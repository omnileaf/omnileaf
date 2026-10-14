import type { SeriesOverview } from "#lib/ipc/bindings.ts";

export type SeriesId = SeriesOverview["id"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Takes an id back from a page address the app made from it, leaving the core to refuse one it never gave out. */
function isSeriesId(text: string): text is SeriesId {
  return UUID.test(text);
}

/** The series a page address names, or nothing for text that can't be an id the core gave out. */
export function seriesIdIn(text: string): SeriesId | undefined {
  return isSeriesId(text) ? text : undefined;
}

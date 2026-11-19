import { commands } from "#lib/ipc/bindings.ts";
import { seriesIdIn } from "#lib/series/series-id.ts";
import {
  SERIES_OVERVIEW,
  type SeriesShown,
} from "#lib/series/series-overview.ts";

import type { PageLoad } from "./$types";

const SKELETONS_AFTER_MS = 150;
const MISSING: SeriesShown = { kind: "missing" };

async function shownOf(
  id: Parameters<typeof commands.seriesOverview>[0],
): Promise<SeriesShown> {
  const [read, counted] = await Promise.all([
    commands.seriesOverview(id),
    commands.seriesChapterVolumes(id),
  ]);
  if (read.status === "error") {
    return read.error.code === "seriesNotFound"
      ? { kind: "missing" }
      : { kind: "failed" };
  }
  if (counted.status === "error") {
    reportError(counted.error);
  }
  return {
    kind: "found",
    overview: read.data,
    chapterVolumes: counted.status === "ok" ? counted.data : [],
  };
}

function waited(ms: number): Promise<undefined> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Waits a moment for the series, so its heading is there for focus to land on, then lets the page show skeletons until it comes. */
export const load: PageLoad = async ({ params, depends }) => {
  depends(SERIES_OVERVIEW);
  const id = seriesIdIn(params.id);
  if (id === undefined) {
    return { id: params.id, shown: MISSING };
  }
  const reading = shownOf(id);
  const read = await Promise.race([reading, waited(SKELETONS_AFTER_MS)]);
  return { id: params.id, shown: read ?? reading };
};

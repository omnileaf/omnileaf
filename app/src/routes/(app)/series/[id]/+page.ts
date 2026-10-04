import { commands } from "#lib/ipc/bindings.ts";
import { seriesIdIn } from "#lib/series/series-id.ts";
import {
  SERIES_OVERVIEW,
  type SeriesShown,
} from "#lib/series/series-overview.ts";

import type { PageLoad } from "./$types";

/** Reads the series before the page shows, so its heading is there for focus to land on. */
export const load: PageLoad = async ({ params, depends }) => {
  depends(SERIES_OVERVIEW);
  const id = seriesIdIn(params.id);
  if (id === undefined) {
    return { shown: { kind: "missing" } satisfies SeriesShown };
  }
  const read = await commands.seriesOverview(id);
  const shown: SeriesShown =
    read.status === "ok"
      ? { kind: "found", id, overview: read.data }
      : read.error.code === "seriesNotFound"
        ? { kind: "missing" }
        : { kind: "failed" };
  return { shown };
};

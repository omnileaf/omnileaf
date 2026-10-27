import { commands } from "#lib/ipc/bindings.ts";
import {
  CREATOR_SERIES,
  type CreatorSeriesRead,
} from "#lib/series/creator-series.ts";
import { seriesIdIn } from "#lib/series/series-id.ts";

import type { PageLoad } from "./$types";

async function seriesBy(creator: string): Promise<CreatorSeriesRead> {
  const read = await commands.creatorSeries(creator);
  return read.status === "ok"
    ? { kind: "read", series: read.data }
    : { kind: "failed" };
}

async function titleOf(from: string | null): Promise<string | undefined> {
  const id = from === null ? undefined : seriesIdIn(from);
  if (id === undefined) {
    return undefined;
  }
  const read = await commands.seriesOverview(id);
  return read.status === "ok" ? read.data.title : undefined;
}

export const load: PageLoad = async ({ params, url, depends }) => {
  depends(CREATOR_SERIES);
  const from = url.searchParams.get("from");
  const [series, fromTitle] = await Promise.all([
    seriesBy(params.name),
    titleOf(from),
  ]);
  return {
    name: params.name,
    series,
    from:
      fromTitle === undefined || from === null
        ? undefined
        : { id: from, title: fromTitle },
  };
};

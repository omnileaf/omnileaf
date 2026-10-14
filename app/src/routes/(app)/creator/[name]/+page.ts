import { commands } from "#lib/ipc/bindings.ts";
import { seriesIdIn } from "#lib/series/series-id.ts";

import type { PageLoad } from "./$types";

async function titleOf(from: string | null): Promise<string | undefined> {
  const id = from === null ? undefined : seriesIdIn(from);
  if (id === undefined) {
    return undefined;
  }
  const read = await commands.seriesOverview(id);
  return read.status === "ok" ? read.data.title : undefined;
}

export const load: PageLoad = async ({ params, url }) => {
  const from = url.searchParams.get("from");
  const [series, fromTitle] = await Promise.all([
    commands.creatorSeries(params.name),
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

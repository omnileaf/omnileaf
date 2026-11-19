import { error } from "@sveltejs/kit";

import { commands, type IpcError } from "#lib/ipc/bindings.ts";
import { type SeriesId, seriesIdIn } from "#lib/series/series-id.ts";
import { SERIES_OVERVIEW } from "#lib/series/series-overview.ts";

import type { PageLoad } from "./$types";

const NOT_FOUND = 404;
const NOT_READ = 500;
const VOLUME_NUMBER = /^\d{1,9}$/u;

function volumeIn(text: string): number | undefined {
  return VOLUME_NUMBER.test(text) ? Number(text) : undefined;
}

function notRead(series: SeriesId, volume: number, failure: IpcError): never {
  reportError(failure);
  error(
    NOT_READ,
    `read volume ${String(volume)} of series ${series}: ${failure.message}`,
  );
}

export const load: PageLoad = async ({ params, depends }) => {
  depends(SERIES_OVERVIEW);
  const series = seriesIdIn(params.id);
  const number = volumeIn(params.volume);
  const missing = `no volume ${params.volume} in series ${params.id}`;
  if (series === undefined || number === undefined) {
    error(NOT_FOUND, missing);
  }
  const [overview, volume] = await Promise.all([
    commands.seriesOverview(series),
    commands.seriesVolume(series, number),
  ]);
  if (overview.status === "error" && overview.error.code === "seriesNotFound") {
    error(NOT_FOUND, missing);
  }
  if (overview.status === "error") {
    notRead(series, number, overview.error);
  }
  if (volume.status === "error") {
    notRead(series, number, volume.error);
  }
  if (volume.data === null) {
    error(NOT_FOUND, missing);
  }
  return { overview: overview.data, volume: volume.data };
};

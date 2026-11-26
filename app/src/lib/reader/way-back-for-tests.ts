import {
  readerSeriesOf,
  readerWayBack,
  type ReaderWayBack,
  type SeriesPlace,
} from "./reader-way-back";

export function seriesWayBackOf(place: SeriesPlace | null): ReaderWayBack {
  return readerWayBack(undefined, readerSeriesOf(place));
}

export function leavesNowhere(): Promise<void> {
  return Promise.resolve();
}

import {
  commands,
  type IpcError,
  type LibraryListing,
  type LibraryTabId,
  type SeriesPage,
} from "#lib/ipc/bindings.ts";

import { librarySeriesList, type ListSeries } from "./library-series.svelte.ts";
import {
  type CountSeries,
  LibrarySeriesCount,
} from "./library-series-count.svelte.ts";

const NOTHING_NEW: { status: "ok"; data: SeriesPage } = {
  status: "ok",
  data: { series: [], next: null },
};
const NONE_NEW = { status: "ok", data: 0 } as const;

function seriesOf(tab: LibraryTabId, listing: LibraryListing): ListSeries {
  switch (tab.kind) {
    case "newChapters":
      return () => Promise.resolve(NOTHING_NEW);
    case "all":
      return (after) => commands.librarySeries(after, listing);
    case "category":
      return (after) => commands.categorySeries(tab.id, after, listing);
  }
}

function countOf(tab: LibraryTabId, listing: LibraryListing): CountSeries {
  switch (tab.kind) {
    case "newChapters":
      return () => Promise.resolve(NONE_NEW);
    case "all":
      return () => commands.librarySeriesCount(listing.filter);
    case "category":
      return () => commands.categorySeriesCount(tab.id, listing.filter);
  }
}

/** The series one library tab lists, and how many it holds, read for whatever listing is chosen when each read begins; showing another tab keeps the series listed until the new ones are read. */
export class TabPage {
  readonly series: ReturnType<typeof librarySeriesList>;
  readonly count: LibrarySeriesCount;
  #tab: LibraryTabId;

  constructor(
    tab: LibraryTabId,
    listedBy: () => LibraryListing,
    onFailure: (error: IpcError) => void,
  ) {
    this.#tab = tab;
    this.series = librarySeriesList((after) =>
      seriesOf(this.#tab, listedBy())(after),
    );
    this.count = new LibrarySeriesCount(
      () => countOf(this.#tab, listedBy())(),
      onFailure,
    );
  }

  showing(tab: LibraryTabId): this {
    this.#tab = tab;
    return this;
  }
}

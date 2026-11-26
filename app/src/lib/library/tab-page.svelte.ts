import {
  commands,
  type IpcError,
  type LibraryListing,
  type LibraryTabId,
  type SeriesPage,
} from "#lib/ipc/bindings.ts";

import {
  type KeptSeries,
  librarySeriesList,
  type ListSeries,
} from "./library-series.svelte.ts";
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

export function countOf(
  tab: LibraryTabId,
  listing: LibraryListing,
): CountSeries {
  switch (tab.kind) {
    case "newChapters":
      return () => Promise.resolve(NONE_NEW);
    case "all":
      return () => commands.librarySeriesCount(listing.filter);
    case "category":
      return () => commands.categorySeriesCount(tab.id, listing.filter);
  }
}

export interface TabReads {
  readonly listedBy: () => LibraryListing;
  readonly onFailure: (error: IpcError) => void;
}

export interface KeptTabPage {
  readonly tab: LibraryTabId;
  readonly series: KeptSeries;
  readonly count: number | undefined;
}

export class TabPage {
  readonly series: ReturnType<typeof librarySeriesList>;
  readonly count: LibrarySeriesCount;
  #tab: LibraryTabId;

  constructor(
    tab: LibraryTabId,
    { listedBy, onFailure }: TabReads,
    kept?: KeptTabPage,
  ) {
    this.#tab = tab;
    this.series = librarySeriesList(
      (after) => seriesOf(this.#tab, listedBy())(after),
      kept?.series,
    );
    this.count = new LibrarySeriesCount(
      () => countOf(this.#tab, listedBy())(),
      onFailure,
      kept?.count,
    );
  }

  get tab(): LibraryTabId {
    return this.#tab;
  }

  kept(shown: number): KeptTabPage | undefined {
    const series = this.series.keptThrough(shown);
    return series === undefined
      ? undefined
      : { tab: this.#tab, series, count: this.count.count };
  }

  showing(tab: LibraryTabId): this {
    this.#tab = tab;
    this.count.clear();
    return this;
  }
}

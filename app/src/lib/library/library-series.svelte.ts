import type { commands, LibrarySeries } from "$lib/ipc/bindings";

export type ListSeries = typeof commands.librarySeries;

type SeriesCursor = NonNullable<Parameters<ListSeries>[0]>;

export type SeriesList =
  | { readonly kind: "loading" }
  | {
      readonly kind: "loaded";
      readonly series: readonly LibrarySeries[];
      readonly isComplete: boolean;
    }
  | { readonly kind: "failed" };

type SeriesPageResult = Awaited<ReturnType<ListSeries>>;

type Read =
  | {
      readonly kind: "read";
      readonly series: readonly LibrarySeries[];
      readonly next: SeriesCursor | null;
    }
  | { readonly kind: "failed" }
  | { readonly kind: "superseded" };

/** The library's series, read a page at a time as far as the screen has needed them. */
export class LibrarySeriesList {
  list: SeriesList = $state({ kind: "loading" });

  #latestLoad = 0;
  #shownLists = 0;
  #next: SeriesCursor | null = null;
  #isLoadingMore = false;

  constructor(private readonly listSeries: ListSeries) {}

  /** Reads from the start as many series as the list shows, at least a page, and only the most recently started load shows its list. */
  async load(): Promise<void> {
    const load = ++this.#latestLoad;
    const shown = this.list.kind === "loaded" ? this.list.series.length : 0;
    const read = await this.#readFromStart(load, shown);
    if (read.kind !== "superseded") {
      this.#show(read);
    }
  }

  /** Reads the page after the last one shown, once at a time, until the list is complete, and drops it if another list was shown meanwhile. */
  async loadMore(): Promise<void> {
    const after = this.#next;
    if (this.list.kind !== "loaded" || after === null || this.#isLoadingMore) {
      return;
    }
    const shownList = this.#shownLists;
    const shown = this.list.series;
    this.#isLoadingMore = true;
    let page: SeriesPageResult;
    try {
      page = await this.listSeries(after);
    } finally {
      this.#isLoadingMore = false;
    }
    if (shownList !== this.#shownLists) {
      return;
    }
    this.#show(
      page.status === "ok"
        ? {
            kind: "read",
            series: [...shown, ...page.data.series],
            next: page.data.next,
          }
        : { kind: "failed" },
    );
  }

  async #readFromStart(load: number, atLeast: number): Promise<Read> {
    const series: LibrarySeries[] = [];
    let after: SeriesCursor | null = null;
    do {
      const page: SeriesPageResult = await this.listSeries(after);
      if (load !== this.#latestLoad) {
        return { kind: "superseded" };
      }
      if (page.status === "error") {
        return { kind: "failed" };
      }
      series.push(...page.data.series);
      after = page.data.next;
    } while (after !== null && series.length < atLeast);
    return { kind: "read", series, next: after };
  }

  #show(read: Exclude<Read, { kind: "superseded" }>): void {
    this.#shownLists += 1;
    if (read.kind === "failed") {
      this.list = { kind: "failed" };
      return;
    }
    this.#next = read.next;
    this.list = {
      kind: "loaded",
      series: read.series,
      isComplete: read.next === null,
    };
  }
}

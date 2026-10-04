import type { commands, LibrarySeries } from "#lib/ipc/bindings.ts";

type SeriesCursor = NonNullable<Parameters<typeof commands.librarySeries>[0]>;

/** Reads the page of series after a cursor, or the first page without one, in the order the library is listed in. */
export type ListSeries = (
  after: SeriesCursor | null,
) => ReturnType<typeof commands.librarySeries>;

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

export class LibrarySeriesList {
  list: SeriesList = $state({ kind: "loading" });

  #latestLoad = 0;
  #listsBegun = 0;
  #next: SeriesCursor | null = null;
  #isLoadingMore = false;

  constructor(private readonly listSeries: ListSeries) {}

  async load(): Promise<void> {
    const shown = this.list.kind === "loaded" ? this.list.series.length : 0;
    await this.#loadAtLeast(shown);
  }

  /** Reads the first page of a list in a new listing, and only the most recently started load shows its list. */
  async start(): Promise<void> {
    this.#listsBegun += 1;
    await this.#loadAtLeast(0);
  }

  async loadMore(): Promise<void> {
    const after = this.#next;
    if (this.list.kind !== "loaded" || after === null || this.#isLoadingMore) {
      return;
    }
    const shownList = this.#listsBegun;
    const shown = this.list.series;
    this.#isLoadingMore = true;
    let page: SeriesPageResult;
    try {
      page = await this.listSeries(after);
    } finally {
      this.#isLoadingMore = false;
    }
    if (shownList !== this.#listsBegun) {
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

  async #loadAtLeast(count: number): Promise<void> {
    const load = ++this.#latestLoad;
    const read = await this.#readFromStart(load, count);
    if (read.kind !== "superseded") {
      this.#show(read);
    }
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
    this.#listsBegun += 1;
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

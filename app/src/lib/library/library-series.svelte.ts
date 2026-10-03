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

interface Read {
  readonly series: readonly LibrarySeries[];
  readonly next: SeriesCursor | null;
}

/** The library's series, read a page at a time as far as the screen has needed them. */
export class LibrarySeriesList {
  list: SeriesList = $state({ kind: "loading" });

  #latestLoad = 0;
  #next: SeriesCursor | null = null;
  #isLoadingMore = false;

  constructor(private readonly listSeries: ListSeries) {}

  /** Reads from the start as many series as the list shows, at least a page, and only the most recently started load shows its list. */
  async load(): Promise<void> {
    const load = ++this.#latestLoad;
    const shown = this.list.kind === "loaded" ? this.list.series.length : 0;
    const read = await this.#readFromStart(shown);
    if (load === this.#latestLoad) {
      this.#show(read);
    }
  }

  /** Reads the page after the last one shown, once at a time, until the list is complete. */
  async loadMore(): Promise<void> {
    const after = this.#next;
    if (this.list.kind !== "loaded" || after === null || this.#isLoadingMore) {
      return;
    }
    const load = this.#latestLoad;
    const shown = this.list.series;
    this.#isLoadingMore = true;
    const page = await this.listSeries(after);
    this.#isLoadingMore = false;
    if (load !== this.#latestLoad) {
      return;
    }
    this.#show(
      page.status === "ok"
        ? { series: [...shown, ...page.data.series], next: page.data.next }
        : undefined,
    );
  }

  async #readFromStart(atLeast: number): Promise<Read | undefined> {
    const series: LibrarySeries[] = [];
    let after: SeriesCursor | null = null;
    do {
      const page: SeriesPageResult = await this.listSeries(after);
      if (page.status === "error") {
        return undefined;
      }
      series.push(...page.data.series);
      after = page.data.next;
    } while (after !== null && series.length < atLeast);
    return { series, next: after };
  }

  #show(read: Read | undefined): void {
    if (read === undefined) {
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

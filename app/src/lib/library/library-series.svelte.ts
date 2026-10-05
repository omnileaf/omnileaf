import type { commands, LibrarySeries } from "$lib/ipc/bindings";

export type ListSeries = typeof commands.librarySeries;

export type SeriesList =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly series: readonly LibrarySeries[] }
  | { readonly kind: "failed" };

/** The first page of the library's series, which is as much as the library screen shows for now. */
export class LibrarySeriesList {
  list: SeriesList = $state({ kind: "loading" });

  #latestLoad = 0;

  constructor(private readonly listSeries: ListSeries) {}

  /** Only the most recently started load shows its list, so a slower older one can't bring back stale series. */
  async load(): Promise<void> {
    const load = ++this.#latestLoad;
    const page = await this.listSeries(null);
    if (load !== this.#latestLoad) {
      return;
    }
    this.list =
      page.status === "ok"
        ? { kind: "loaded", series: page.data.series }
        : { kind: "failed" };
  }
}

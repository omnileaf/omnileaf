import type { commands } from "$lib/ipc/bindings";

export type CountSeries = typeof commands.librarySeriesCount;

/** How many series the library holds, as last counted. */
export class LibrarySeriesCount {
  count: number | undefined = $state();

  #latestLoad = 0;

  constructor(private readonly countSeries: CountSeries) {}

  /** Keeps only the most recently started count, and no count once counting fails. */
  async load(): Promise<void> {
    const load = ++this.#latestLoad;
    const result = await this.countSeries();
    if (load === this.#latestLoad) {
      this.count = result.status === "ok" ? result.data : undefined;
    }
  }
}

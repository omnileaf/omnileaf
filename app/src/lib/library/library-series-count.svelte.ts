import type { commands, IpcError } from "$lib/ipc/bindings";

export type CountSeries = typeof commands.librarySeriesCount;

/** How many series the library holds, as last counted. */
export class LibrarySeriesCount {
  count: number | undefined = $state();

  #latestLoad = 0;

  constructor(
    private readonly countSeries: CountSeries,
    private readonly onFailure: (error: IpcError) => void,
  ) {}

  /** Keeps only the most recently started count, and no count once counting fails, reporting why. */
  async load(): Promise<void> {
    const load = ++this.#latestLoad;
    const result = await this.countSeries();
    if (result.status === "error") {
      this.onFailure(result.error);
    }
    if (load === this.#latestLoad) {
      this.count = result.status === "ok" ? result.data : undefined;
    }
  }
}

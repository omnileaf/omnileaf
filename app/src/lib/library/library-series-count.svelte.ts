import type { commands, IpcError } from "#lib/ipc/bindings.ts";

/** Counts the series the library lists through the filter it is listed with. */
export type CountSeries = () => ReturnType<typeof commands.librarySeriesCount>;

export class LibrarySeriesCount {
  count: number | undefined = $state();

  #latestLoad = 0;

  constructor(
    private readonly countSeries: CountSeries,
    private readonly onFailure: (error: IpcError) => void,
  ) {}

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

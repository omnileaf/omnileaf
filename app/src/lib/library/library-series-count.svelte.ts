import type { commands, IpcError } from "#lib/ipc/bindings.ts";

export type CountSeries = () => ReturnType<typeof commands.librarySeriesCount>;

export class LibrarySeriesCount {
  count: number | undefined = $state();
  hasFailed = $state(false);

  #latestLoad = 0;
  isLoading = false;

  constructor(
    private readonly countSeries: CountSeries,
    private readonly onFailure: (error: IpcError) => void,
  ) {}

  clear(): void {
    this.#latestLoad += 1;
    this.isLoading = false;
    this.count = undefined;
    this.hasFailed = false;
  }

  load(): Promise<void> {
    this.count = undefined;
    this.hasFailed = false;
    return this.refresh();
  }

  async refresh(): Promise<void> {
    const load = ++this.#latestLoad;
    this.isLoading = true;
    const result = await this.countSeries();
    if (result.status === "error") {
      this.onFailure(result.error);
    }
    if (load === this.#latestLoad) {
      this.isLoading = false;
      this.count = result.status === "ok" ? result.data : undefined;
      this.hasFailed = result.status === "error";
    }
  }
}

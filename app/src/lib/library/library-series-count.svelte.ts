import type { commands, IpcError } from "#lib/ipc/bindings.ts";

export type CountSeries = () => ReturnType<typeof commands.librarySeriesCount>;

export type TabCount =
  | { readonly kind: "counting" }
  | { readonly kind: "counted"; readonly count: number }
  | { readonly kind: "failed" };

const COUNTING: TabCount = { kind: "counting" };
const FAILED: TabCount = { kind: "failed" };

export class LibrarySeriesCount {
  #reading = $state.raw<TabCount>(COUNTING);
  #latestLoad = 0;
  #isLoading = false;

  constructor(
    private readonly countSeries: CountSeries,
    private readonly onFailure: (error: IpcError) => void,
    kept?: number,
  ) {
    if (kept !== undefined) {
      this.#reading = { kind: "counted", count: kept };
    }
  }

  get reading(): TabCount {
    return this.#reading;
  }

  get count(): number | undefined {
    return this.#reading.kind === "counted" ? this.#reading.count : undefined;
  }

  get isLoading(): boolean {
    return this.#isLoading;
  }

  clear(): void {
    this.#latestLoad += 1;
    this.#isLoading = false;
    this.#reading = COUNTING;
  }

  load(): Promise<void> {
    this.#reading = COUNTING;
    return this.refresh();
  }

  async refresh(): Promise<void> {
    const load = ++this.#latestLoad;
    this.#isLoading = true;
    const result = await this.countSeries();
    if (result.status === "error") {
      this.onFailure(result.error);
    }
    if (load === this.#latestLoad) {
      this.#isLoading = false;
      this.#reading =
        result.status === "ok"
          ? { kind: "counted", count: result.data }
          : FAILED;
    }
  }
}

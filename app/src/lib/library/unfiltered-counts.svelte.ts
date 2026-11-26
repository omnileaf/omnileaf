import { SvelteMap } from "svelte/reactivity";

import type { IpcError, LibraryTabId } from "#lib/ipc/bindings.ts";

import {
  type CountSeries,
  LibrarySeriesCount,
  type TabCount,
} from "./library-series-count.svelte.ts";
import { tabKey } from "./library-tabs.ts";

export type CountTab = (tab: LibraryTabId) => CountSeries;

export type KeptCounts = Readonly<Record<string, number>>;

const NOT_COUNTED: TabCount = { kind: "counting" };

export class UnfilteredCounts {
  readonly #asked = new SvelteMap<string, LibrarySeriesCount>();
  #kept: KeptCounts;

  constructor(
    private readonly countTab: CountTab,
    private readonly onFailure: (error: IpcError, key: string) => void,
    kept: KeptCounts = {},
  ) {
    this.#kept = kept;
  }

  kept(): KeptCounts {
    return Object.fromEntries(
      [...this.#asked].flatMap(([key, { count }]) =>
        count === undefined ? [] : [[key, count] as const],
      ),
    );
  }

  ask(tabs: readonly LibraryTabId[]): void {
    const wanted = tabs.map(tabKey);
    for (const [key, count] of [...this.#asked]) {
      if (!wanted.includes(key)) {
        count.clear();
        this.#asked.delete(key);
      }
    }
    for (const tab of tabs) {
      const key = tabKey(tab);
      if (!this.#asked.has(key)) {
        this.#asked.set(key, this.#started(tab));
      }
    }
  }

  of(key: string): TabCount {
    return this.#asked.get(key)?.reading ?? NOT_COUNTED;
  }

  async refresh(): Promise<void> {
    await Promise.all(
      [...this.#asked.values()].map((count) => count.refresh()),
    );
  }

  #started(tab: LibraryTabId): LibrarySeriesCount {
    const key = tabKey(tab);
    const kept = this.#kept[key];
    this.#kept = Object.fromEntries(
      Object.entries(this.#kept).filter(([counted]) => counted !== key),
    );
    const count = new LibrarySeriesCount(
      this.countTab(tab),
      (error) => {
        this.onFailure(error, key);
      },
      kept,
    );
    void (kept === undefined ? count.load() : count.refresh());
    return count;
  }
}

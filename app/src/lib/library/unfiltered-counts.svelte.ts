import { SvelteMap } from "svelte/reactivity";

import type { IpcError, LibraryTabId } from "#lib/ipc/bindings.ts";

import {
  type CountSeries,
  LibrarySeriesCount,
  type TabCount,
} from "./library-series-count.svelte.ts";
import { tabKey } from "./library-tabs.ts";

export type CountTab = (tab: LibraryTabId) => CountSeries;

const NOT_COUNTED: TabCount = { kind: "counting" };

export class UnfilteredCounts {
  readonly #asked = new SvelteMap<string, LibrarySeriesCount>();

  constructor(
    private readonly countTab: CountTab,
    private readonly onFailure: (error: IpcError, key: string) => void,
  ) {}

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
    const count = new LibrarySeriesCount(this.countTab(tab), (error) => {
      this.onFailure(error, tabKey(tab));
    });
    void count.load();
    return count;
  }
}

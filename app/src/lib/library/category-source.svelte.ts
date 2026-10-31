import type { ArrangedTab } from "./library-tabs.ts";

export class CategorySource {
  tabs = $state<readonly ArrangedTab[]>([]);
  chosen = $state("");
  #onChoose: ((key: string) => void) | undefined;

  publish(
    tabs: readonly ArrangedTab[],
    chosen: string,
    onChoose: (key: string) => void,
  ): void {
    this.tabs = tabs;
    this.chosen = chosen;
    this.#onChoose = onChoose;
  }

  clear(): void {
    this.tabs = [];
    this.chosen = "";
    this.#onChoose = undefined;
  }

  choose(key: string): void {
    this.#onChoose?.(key);
  }
}

export const categorySource = new CategorySource();

export class TabScroll {
  readonly #tops: Map<string, number>;

  constructor(kept: ReadonlyMap<string, number> = new Map()) {
    this.#tops = new Map(kept);
  }

  remember(tab: string, top: number): void {
    this.#tops.set(tab, top);
  }

  recall(tab: string): number {
    return this.#tops.get(tab) ?? 0;
  }

  kept(): ReadonlyMap<string, number> {
    return new Map(this.#tops);
  }

  forgetAll(): void {
    this.#tops.clear();
  }
}

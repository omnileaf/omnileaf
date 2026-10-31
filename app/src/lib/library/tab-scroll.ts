export class TabScroll {
  readonly #tops = new Map<string, number>();

  remember(tab: string, top: number): void {
    this.#tops.set(tab, top);
  }

  recall(tab: string): number {
    return this.#tops.get(tab) ?? 0;
  }

  forgetAll(): void {
    this.#tops.clear();
  }
}

export class PageTurner {
  readonly count: number;
  #shown = $state(0);
  #isPastEnd = $state(false);

  constructor(count: number, start: number) {
    this.count = count;
    this.goTo(start);
  }

  get shown(): number {
    return this.#shown;
  }

  get isFirst(): boolean {
    return this.#shown === 0;
  }

  /** Turned on from the last page, where the reader offers the next book. */
  get isPastEnd(): boolean {
    return this.#isPastEnd;
  }

  get isLast(): boolean {
    return this.#shown === this.count - 1;
  }

  turn(step: number): void {
    if (step > 0 && this.isLast) {
      this.#isPastEnd = true;
      return;
    }
    this.goTo(this.#isPastEnd ? this.#shown : this.#shown + step);
  }

  goTo(index: number): void {
    this.#isPastEnd = false;
    this.#shown = Math.min(this.count - 1, Math.max(0, Math.trunc(index)));
  }
}

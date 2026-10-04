/** Which page of a book is shown, counting from 0, kept within the book however far a turn asks to go. */
export class PageTurner {
  readonly count: number;
  #shown = $state(0);

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

  get isLast(): boolean {
    return this.#shown === this.count - 1;
  }

  turn(step: number): void {
    this.goTo(this.#shown + step);
  }

  goTo(index: number): void {
    this.#shown = Math.min(this.count - 1, Math.max(0, Math.trunc(index)));
  }
}

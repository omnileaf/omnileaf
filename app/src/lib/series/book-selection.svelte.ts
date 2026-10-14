import { SvelteSet } from "svelte/reactivity";

export class BookSelection<BookId> {
  isSelecting = $state(false);

  readonly #picked = new SvelteSet<BookId>();
  #anchor: BookId | undefined;

  get count(): number {
    return this.#picked.size;
  }

  has(book: BookId): boolean {
    return this.#picked.has(book);
  }

  hasAll(listed: readonly BookId[]): boolean {
    return listed.length > 0 && listed.every((book) => this.#picked.has(book));
  }

  begin(book?: BookId): void {
    this.isSelecting = true;
    if (book !== undefined) {
      this.toggle(book);
    }
  }

  toggle(book: BookId): void {
    if (!this.#picked.delete(book)) {
      this.#picked.add(book);
    }
    this.#anchor = book;
  }

  extendTo(book: BookId, listed: readonly BookId[]): void {
    const end = listed.indexOf(book);
    if (end === -1) {
      return;
    }
    const anchor =
      this.#anchor === undefined ? -1 : listed.indexOf(this.#anchor);
    const start = anchor === -1 ? end : anchor;
    const [first, last] = start <= end ? [start, end] : [end, start];
    this.pickAll(listed.slice(first, last + 1));
    this.#anchor = book;
  }

  pickAll(listed: readonly BookId[]): void {
    for (const book of listed) {
      this.#picked.add(book);
    }
  }

  /** Every book picked, in the order it was picked, whether the list shows it now or not. */
  get picked(): BookId[] {
    return [...this.#picked];
  }

  end(): void {
    this.isSelecting = false;
    this.#picked.clear();
    this.#anchor = undefined;
  }
}

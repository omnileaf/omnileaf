import { SvelteSet } from "svelte/reactivity";

/** Which of a series' books are picked to mark at once, while picking them. */
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

  /** Starts picking, with `book` picked when picking starts from one. */
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

  /** Picks every book listed between the book last toggled and `book`, both included. */
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

  /** The picked books still listed, in the list's order. */
  pickedIn(listed: readonly BookId[]): BookId[] {
    return listed.filter((book) => this.#picked.has(book));
  }

  end(): void {
    this.isSelecting = false;
    this.#picked.clear();
    this.#anchor = undefined;
  }
}

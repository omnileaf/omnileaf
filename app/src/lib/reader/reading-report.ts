import type { BookId } from "#lib/reader/opened-book.ts";

/** Where the core hears about reading, which it saves once the reader has restored the book. */
export interface ReadingCore {
  restored(book: BookId, page: number): void;
  shown(book: BookId, page: number): void;
  closed(book: BookId): void;
}

/** Tells the core the page reading was restored to, then each page shown after it, until the book closes. */
export class ReadingReport {
  #isRestored = false;
  #isClosed = false;

  constructor(
    readonly book: BookId,
    private readonly core: ReadingCore,
  ) {}

  show(page: number): void {
    if (this.#isClosed) {
      return;
    }
    if (this.#isRestored) {
      this.core.shown(this.book, page);
      return;
    }
    this.#isRestored = true;
    this.core.restored(this.book, page);
  }

  close(): void {
    if (this.#isClosed) {
      return;
    }
    this.#isClosed = true;
    this.core.closed(this.book);
  }
}

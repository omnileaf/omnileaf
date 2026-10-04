import type { BookId } from "#lib/reader/opened-book.ts";

/** Where the core hears about reading, each report resolving once it is heard and never rejecting. */
export interface ReadingCore {
  restored(book: BookId, page: number): Promise<void>;
  shown(book: BookId, page: number): Promise<void>;
  closed(book: BookId): Promise<void>;
}

/** Tells the core the page reading was restored to, then each page shown after it, until the book closes. */
export class ReadingReport {
  #isRestored = false;
  #isClosed = false;
  #heard: Promise<void> = Promise.resolve();

  constructor(
    readonly book: BookId,
    private readonly core: ReadingCore,
  ) {}

  show(page: number): void {
    if (this.#isClosed) {
      return;
    }
    if (this.#isRestored) {
      this.#send(() => this.core.shown(this.book, page));
      return;
    }
    this.#isRestored = true;
    this.#send(() => this.core.restored(this.book, page));
  }

  close(): void {
    if (this.#isClosed) {
      return;
    }
    this.#isClosed = true;
    this.#send(() => this.core.closed(this.book));
  }

  /** Sends the report once the core has heard the one before, since commands sent at once may reach it in any order. */
  #send(report: () => Promise<void>): void {
    this.#heard = this.#heard.then(report);
  }
}

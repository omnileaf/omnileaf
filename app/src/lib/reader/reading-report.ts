import type { commands } from "#lib/ipc/bindings.ts";
import type { BookId } from "#lib/reader/opened-book.ts";

type Heard = ReturnType<typeof commands.pageShown>;

export interface ReadingCore {
  restored(book: BookId, page: number): Heard;
  shown(book: BookId, page: number): Heard;
  closed(book: BookId): Heard;
}

export class ReadingReport {
  #isRestored = false;
  #isClosed = false;
  #heard: Promise<void> = Promise.resolve();

  constructor(
    readonly book: BookId,
    private readonly core: ReadingCore,
    private readonly onFailure: (error: unknown) => void,
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
  #send(report: () => Heard): void {
    this.#heard = this.#heard.then(report).then(
      (answer) => {
        if (answer.status === "error") {
          this.onFailure(answer.error);
        }
      },
      (error: unknown) => {
        this.onFailure(error);
      },
    );
  }
}

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND } from "./fixtures.ts";

export type WireBook = Awaited<
  ReturnType<FakeBackend["seriesBooks"]>
>["books"][number];

type WireReading = WireBook["reading"];

export const SERIES_ID = "0190a3e4-0000-8000-8000-0000000000a4";
export const SERIES_TITLE = "Sample Series 04";
export const SERIES_FOLDER = "Sample Library";
export const ADDED_AT = "2026-09-21T14:13:20.000Z";
export const BOOKS_PER_PAGE = 100;

/** A series' books, as the core holds them, that marking books read changes. */
export class FakeShelf {
  readonly marked: { readonly books: string[]; readonly mark: string }[] = [];
  readonly #books: WireBook[];

  constructor(readings: readonly WireReading[]) {
    this.#books = readings.map((reading, index) => ({
      id: `0190a3e4-0000-8000-8000-${String(index + 1).padStart(12, "0")}`,
      position: index + 1,
      title: `${SERIES_TITLE} v${String(index + 1).padStart(2, "0")}`,
      addedAt: ADDED_AT,
      reading,
    }));
  }

  get books(): readonly WireBook[] {
    return this.#books;
  }

  titleOf(index: number): string {
    return this.#bookAt(index).title;
  }

  idOf(index: number): string {
    return this.#bookAt(index).id;
  }

  #bookAt(index: number): WireBook {
    const book = this.#books[index];
    if (book === undefined) {
      throw new Error(`the shelf has no book ${String(index)}`);
    }
    return book;
  }

  backend(): FakeBackend {
    return {
      ...DEFAULT_BACKEND,
      seriesOverview: (id) => {
        if (id !== SERIES_ID) {
          return DEFAULT_BACKEND.seriesOverview(id);
        }
        return {
          id: SERIES_ID,
          title: SERIES_TITLE,
          bookCount: this.#books.length,
          readCount: this.#books.filter((book) => book.reading.state === "read")
            .length,
          cover: null,
          folder: SERIES_FOLDER,
          upNext: this.#upNext() ?? null,
        };
      },
      seriesBooks: (id, listing, after) => {
        const shown =
          listing.shown === "unread"
            ? this.#books.filter((book) => book.reading.state !== "read")
            : this.#books;
        const ordered =
          listing.direction === "descending" ? shown.toReversed() : shown;
        const listed = id === SERIES_ID ? ordered : [];
        const start = after === null ? 0 : Number(after);
        const end = start + BOOKS_PER_PAGE;
        return {
          books: listed.slice(start, end),
          next: end < listed.length ? String(end) : null,
        };
      },
      markBooks: (books, mark) => {
        this.marked.push({ books, mark });
        for (const book of this.#books) {
          if (books.includes(book.id)) {
            book.reading =
              mark === "read" ? { state: "read" } : { state: "notStarted" };
          }
        }
        return null;
      },
    };
  }

  #upNext(): WireBook | undefined {
    return (
      this.#books.find((book) => book.reading.state === "started") ??
      this.#books.find((book) => book.reading.state === "notStarted")
    );
  }
}

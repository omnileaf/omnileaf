import { isShownBy } from "../../src/lib/series/books-shown.ts";

import type { FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND } from "./fixtures.ts";

export type WireBook = Awaited<
  ReturnType<FakeBackend["seriesBooks"]>
>["books"][number];

type WireReading = WireBook["reading"];

type WireOverview = Awaited<ReturnType<FakeBackend["seriesOverview"]>>;

export type SeriesDetails = Pick<
  WireOverview,
  "format" | "creators" | "summary" | "tags" | "related" | "secondsLeft"
>;

const NO_DETAILS: SeriesDetails = {
  format: null,
  creators: [],
  summary: null,
  tags: [],
  related: [],
  secondsLeft: null,
};

export const SERIES_ID = "0190a3e4-0000-8000-8000-0000000000a4";
export const SERIES_TITLE = "Sample Series 04";
export const SERIES_FOLDER = "Sample Library";
export const ADDED_AT_MS = 1_790_000_000_000;
export const BOOKS_PER_PAGE = 100;

export class FakeShelf {
  readonly marked: { readonly books: string[]; readonly mark: string }[] = [];
  readonly #books: WireBook[];
  readonly #details: SeriesDetails;
  #laterPages: Promise<void> = Promise.resolve();

  constructor(
    readings: readonly WireReading[],
    details: Partial<SeriesDetails> = {},
    pageCount: number | null = null,
  ) {
    this.#details = { ...NO_DETAILS, ...details };
    this.#books = readings.map((reading, index) => ({
      id: `0190a3e4-0000-8000-8000-${String(index + 1).padStart(12, "0")}`,
      position: index + 1,
      title: `${SERIES_TITLE} v${String(index + 1).padStart(2, "0")}`,
      addedAtMs: ADDED_AT_MS,
      reading,
      pageCount,
      isBookmarked: false,
      isNew: false,
      isFileMissing: false,
    }));
  }

  holdPagesAfterTheFirst(released: Promise<void>): void {
    this.#laterPages = released;
  }

  get books(): readonly WireBook[] {
    return this.#books;
  }

  bookmark(index: number): void {
    this.#bookAt(index).isBookmarked = true;
  }

  markNew(index: number): void {
    this.#bookAt(index).isNew = true;
  }

  readTo(index: number, page: number): void {
    this.#bookAt(index).reading = { state: "started", page };
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
          bookmarkCount: this.#books.filter((book) => book.isBookmarked).length,
          cover: null,
          folder: SERIES_FOLDER,
          upNext: this.#upNext() ?? null,
          ...this.#details,
        };
      },
      seriesBooks: async (id, listing, after) => {
        if (after !== null) {
          await this.#laterPages;
        }
        const shown = this.#books.filter((book) =>
          isShownBy(listing.shown, book),
        );
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

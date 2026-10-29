import type { BookFile, BookPlace, OpenedBook } from "#lib/ipc/bindings.ts";
import { hasIdShape } from "#lib/ipc/id-shape.ts";

export type BookId = OpenedBook["id"];

export type BookProblem = "missing" | "unreadable" | "failed";

export type BookShown =
  | { readonly kind: "found"; readonly book: OpenedBook }
  | { readonly kind: BookProblem; readonly place: BookPlace | null }
  | {
      readonly kind: "unsupported";
      readonly place: BookPlace | null;
      readonly file: BookFile | null;
    };

function isBookId(text: string): text is BookId {
  return hasIdShape(text);
}

export function bookIdIn(text: string): BookId | undefined {
  return isBookId(text) ? text : undefined;
}

/** Keys per-series reading state, kept out of a made-up series for a book opened outside the library. */
export function librarySeriesKey(book: OpenedBook): string {
  return book.isInLibrary ? book.series : "";
}

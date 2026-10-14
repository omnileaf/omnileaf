import type { BooksShown, SeriesBook } from "#lib/ipc/bindings.ts";

export function isShownBy(
  shown: BooksShown,
  book: Pick<SeriesBook, "reading" | "isBookmarked">,
): boolean {
  switch (shown) {
    case "all":
      return true;
    case "unread":
      return book.reading.state !== "read";
    case "bookmarked":
      return book.isBookmarked;
  }
}

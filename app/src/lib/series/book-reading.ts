import type { BookReading } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

/** How far a book has been read, in a word or two, with what an unread book shows instead. */
export function readingWords(
  reading: BookReading,
  unread: () => string,
): string {
  switch (reading.state) {
    case "notStarted":
      return unread();
    case "started":
      return reading.page === null
        ? m.series_book_started()
        : m.series_book_page({ page: reading.page });
    case "read":
      return m.series_book_read();
  }
}

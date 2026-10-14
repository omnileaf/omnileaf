import type { BookReading, SeriesBook } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

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

export interface PageProgress {
  readonly page: number;
  readonly pages: number;
}

export function progressOf(
  book: Pick<SeriesBook, "reading" | "pageCount">,
): PageProgress | undefined {
  const { reading, pageCount } = book;
  return reading.state === "started" &&
    reading.page !== null &&
    pageCount !== null
    ? { page: reading.page, pages: pageCount }
    : undefined;
}

export function progressWords(
  book: Pick<SeriesBook, "reading" | "pageCount">,
): string {
  const progress = progressOf(book);
  return progress === undefined
    ? readingWords(book.reading, m.series_book_unread)
    : m.series_book_page_of(progress);
}

export function bookSummary(
  book: Pick<SeriesBook, "reading" | "pageCount">,
): string {
  const { reading, pageCount: pages } = book;
  if (reading.state === "started" || pages === null) {
    return progressWords(book);
  }
  return reading.state === "read"
    ? m.series_book_read_pages({ pages })
    : m.series_book_unread_pages({ pages });
}

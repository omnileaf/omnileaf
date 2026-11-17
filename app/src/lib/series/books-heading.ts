import type { SeriesOverview, SeriesVolume } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export interface BooksHeading {
  readonly title: string;
  readonly line: string;
}

export function seriesBooksHeading({
  bookCount,
  readCount,
  bookmarkCount,
}: Pick<
  SeriesOverview,
  "bookCount" | "readCount" | "bookmarkCount"
>): BooksHeading {
  return {
    title: m.series_books_heading({ count: bookCount }),
    line:
      bookmarkCount > 0
        ? m.series_read_and_bookmarked({
            read: readCount,
            bookmarked: bookmarkCount,
          })
        : m.series_read_only({ read: readCount }),
  };
}

export function volumeBooksHeading({
  bookCount,
  readCount,
  folder,
}: Pick<SeriesVolume, "bookCount" | "readCount" | "folder">): BooksHeading {
  return {
    title: m.series_chapter_count({ count: bookCount }),
    line:
      folder === null
        ? m.series_read_only({ read: readCount })
        : m.series_volume_folder_note(),
  };
}

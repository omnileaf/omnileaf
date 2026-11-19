import type { ChapterVolume } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export function volumeTileMeta({
  bookCount,
  readCount,
  startedCount,
}: Pick<ChapterVolume, "bookCount" | "readCount" | "startedCount">): string {
  if (readCount === bookCount) {
    return m.series_book_read();
  }
  return startedCount === 0
    ? m.series_book_unread()
    : m.series_volume_read_count({ read: readCount, total: bookCount });
}

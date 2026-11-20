import type { LibrarySeries, Platform } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

type CountedSeries = Pick<
  LibrarySeries,
  "bookCount" | "volumeCount" | "chapterCount"
>;

const PLATFORMS_COUNTING_VOLUMES_AND_CHAPTERS: readonly Platform[] = [
  "android",
];

export function seriesCountLine(
  series: CountedSeries,
  platform: Platform,
): string {
  if (!PLATFORMS_COUNTING_VOLUMES_AND_CHAPTERS.includes(platform)) {
    return m.library_series_books({ count: series.bookCount });
  }
  return volumesAndChaptersLine(series);
}

function volumesAndChaptersLine({
  bookCount,
  volumeCount,
  chapterCount,
}: CountedSeries): string {
  if (bookCount === 1 && volumeCount === 0) {
    return m.library_series_one_shot();
  }
  if (volumeCount > 0 && chapterCount > 0) {
    return m.library_series_volumes_and_chapters({
      volumes: volumeCount,
      chapters: chapterCount,
    });
  }
  if (volumeCount > 0) {
    return m.library_series_volumes({ count: volumeCount });
  }
  if (chapterCount > 0) {
    return m.library_series_chapters({ count: chapterCount });
  }
  return m.library_series_books({ count: bookCount });
}

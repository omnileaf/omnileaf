import type { SeriesBook, SeriesOverview } from "#lib/ipc/bindings.ts";
import { type NamedSeries, standInLook } from "#lib/library/series-look.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { folderStandIn } from "#lib/screenshot-mode/stand-ins.ts";

/** Names each of a series' books after the series' stand-in and the book's place in the series, so the series keeps the number the library gives it. */
export function bookStandIns(
  series: NamedSeries,
): (book: SeriesBook) => SeriesBook {
  const seriesName = standInLook(series).title;
  const places = new Intl.NumberFormat(getLocale());
  return (book) => ({
    ...book,
    title: m.stand_in_book({
      series: seriesName,
      number: places.format(book.position),
    }),
  });
}

/** Leaves the cover's path behind, so no picture of it is ever asked for. */
export function standInOverview(overview: SeriesOverview): SeriesOverview {
  return {
    ...overview,
    title: standInLook(overview).title,
    cover: null,
    folder: overview.folder === null ? null : folderStandIn(overview.folder),
    upNext:
      overview.upNext === null ? null : bookStandIns(overview)(overview.upNext),
  };
}

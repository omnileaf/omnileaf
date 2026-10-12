import type {
  HistoryEntry,
  OpenedBook,
  SeriesBook,
  SeriesNeighbour,
  SeriesOverview,
} from "#lib/ipc/bindings.ts";
import { type NamedSeries, standInLook } from "#lib/library/series-look.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { folderStandIn } from "#lib/screenshot-mode/stand-ins.ts";

function seriesOf(
  book: Pick<HistoryEntry, "series" | "seriesTitle">,
): NamedSeries {
  return { id: book.series, title: book.seriesTitle, cover: null };
}

/** Names a book after its series' stand-in and its place in the series, so the series keeps the number the library gives it. */
function standInBookTitles(series: NamedSeries): (position: number) => string {
  const seriesName = standInLook(series).title;
  const places = new Intl.NumberFormat(getLocale());
  return (position) =>
    m.stand_in_book({ series: seriesName, number: places.format(position) });
}

export function bookStandIns(
  series: NamedSeries,
): (book: SeriesBook) => SeriesBook {
  const titled = standInBookTitles(series);
  return (book) => ({ ...book, title: titled(book.position) });
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

export function standInOpenedBook(book: OpenedBook): OpenedBook {
  const series = seriesOf(book);
  const titled = standInBookTitles(series);
  const neighbour = (
    beside: SeriesNeighbour | null,
    position: number,
  ): SeriesNeighbour | null =>
    beside === null ? null : { ...beside, title: titled(position) };
  return {
    ...book,
    title: titled(book.position),
    seriesTitle: standInLook(series).title,
    previous: neighbour(book.previous, book.position - 1),
    next: neighbour(book.next, book.position + 1),
  };
}

export function standInHistoryEntry(entry: HistoryEntry): HistoryEntry {
  const series = seriesOf(entry);
  return {
    ...entry,
    seriesTitle: standInLook(series).title,
    bookTitle: standInBookTitles(series)(entry.position),
    cover: null,
  };
}

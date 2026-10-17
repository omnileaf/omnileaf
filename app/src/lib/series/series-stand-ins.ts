import type {
  HistoryEntry,
  OpenedBook,
  SeriesBook,
  SeriesCreator,
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

export function standInBook(book: SeriesBook): SeriesBook {
  const places = new Intl.NumberFormat(getLocale());
  return {
    ...book,
    title: m.stand_in_series_book({ number: places.format(book.position) }),
  };
}

function counted(
  name: (inputs: { number: string }) => string,
): (_: unknown, index: number) => string {
  const places = new Intl.NumberFormat(getLocale());
  return (_, index) => name({ number: places.format(index + 1) });
}

function creatorStandIns(): (
  creator: SeriesCreator,
  index: number,
) => SeriesCreator {
  const writer = counted(m.stand_in_writer);
  const artist = counted(m.stand_in_artist);
  return (creator, index) => ({
    ...creator,
    name: (creator.role === "art" ? artist : writer)(creator, index),
  });
}

/** Leaves the cover's path behind, so no picture of it is ever asked for. */
export function standInOverview(overview: SeriesOverview): SeriesOverview {
  return {
    ...overview,
    title: standInLook(overview).title,
    creators: overview.creators.map(creatorStandIns()),
    summary: overview.summary === null ? null : m.stand_in_summary(),
    tags: overview.tags.map(counted(m.stand_in_tag)),
    cover: null,
    folder: overview.folder === null ? null : folderStandIn(overview.folder),
    upNext: overview.upNext === null ? null : standInBook(overview.upNext),
  };
}

export function standInOpenedBook(book: OpenedBook): OpenedBook {
  const series = seriesOf(book);
  const titled = standInBookTitles(series);
  const neighbour = (
    beside: SeriesNeighbour | null,
    position: number,
  ): SeriesNeighbour | null =>
    beside === null
      ? null
      : { ...beside, title: titled(position), cover: null };
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

import type { SeriesBook, SeriesOverview } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";
import {
  standInName,
  standInNumber,
  standInNumberFor,
} from "#lib/screenshot-mode/stand-ins.ts";

import type { SeriesId } from "./series-id";

/** Names a book after its series' stand-in, so the series keeps the number the library gives it. */
export function standInBook(book: SeriesBook, series: SeriesId): SeriesBook {
  return {
    ...book,
    title: m.stand_in_book({
      series: standInName("series", standInNumberFor(series)),
      number: standInNumber(standInNumberFor(book.id)),
    }),
  };
}

/** Leaves the cover's path behind, so no picture of it is ever asked for. */
export function standInOverview(overview: SeriesOverview): SeriesOverview {
  return {
    ...overview,
    title: standInName("series", standInNumberFor(overview.id)),
    cover: null,
    folder:
      overview.folder === null
        ? null
        : standInName("folder", standInNumberFor(overview.folder)),
    upNext:
      overview.upNext === null
        ? null
        : standInBook(overview.upNext, overview.id),
  };
}

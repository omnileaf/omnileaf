import { commands, type SeriesBook } from "#lib/ipc/bindings.ts";
import { PagedList } from "#lib/paging/paged-list.svelte.ts";

import type { SeriesId } from "./series-id";

type BookCursor = NonNullable<Parameters<typeof commands.seriesBooks>[1]>;

/** A series' books in order, read a page at a time, from whichever series `series` names when each page is read. */
export function seriesBookList(
  series: () => SeriesId,
): PagedList<SeriesBook, BookCursor> {
  return new PagedList(async (after) => {
    const page = await commands.seriesBooks(series(), after);
    return page.status === "ok"
      ? { status: "ok", data: { items: page.data.books, next: page.data.next } }
      : page;
  });
}

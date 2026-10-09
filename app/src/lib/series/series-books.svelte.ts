import {
  commands,
  type SeriesBook,
  type SeriesBookListing,
} from "#lib/ipc/bindings.ts";
import { PagedList } from "#lib/paging/paged-list.svelte.ts";

import type { SeriesId } from "./series-id";

type BookCursor = NonNullable<Parameters<typeof commands.seriesBooks>[2]>;

/** A series' books as `listing` asks when each page is read, a page at a time. */
export function seriesBookList(
  series: SeriesId,
  listing: () => SeriesBookListing,
): PagedList<SeriesBook, BookCursor> {
  return new PagedList(async (after) => {
    const page = await commands.seriesBooks(series, listing(), after);
    return page.status === "ok"
      ? { status: "ok", data: { items: page.data.books, next: page.data.next } }
      : page;
  });
}

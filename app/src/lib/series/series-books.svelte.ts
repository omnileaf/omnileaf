import {
  commands,
  type SeriesBook,
  type SeriesBookListing,
} from "#lib/ipc/bindings.ts";
import { PagedList } from "#lib/paging/paged-list.svelte.ts";

import type { SeriesId } from "./series-id";

type BookCursor = NonNullable<Parameters<typeof commands.seriesBooks>[2]>;

/** A series' books a page at a time, listed as `listing` asks when the list is read from its start, so every later page goes on in that listing. */
export function seriesBookList(
  series: SeriesId,
  listing: () => SeriesBookListing,
): PagedList<SeriesBook, BookCursor> {
  let listed: SeriesBookListing | undefined;
  return new PagedList(async (after) => {
    if (after === null || listed === undefined) {
      listed = listing();
    }
    const page = await commands.seriesBooks(series, listed, after);
    return page.status === "ok"
      ? { status: "ok", data: { items: page.data.books, next: page.data.next } }
      : page;
  });
}

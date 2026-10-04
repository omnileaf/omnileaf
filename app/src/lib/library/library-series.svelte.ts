import type { commands, LibrarySeries } from "#lib/ipc/bindings.ts";
import { PagedList } from "#lib/paging/paged-list.svelte.ts";

type SeriesCursor = NonNullable<Parameters<typeof commands.librarySeries>[0]>;

/** Reads the page of series after a cursor, or the first page without one, in the order the library is listed in. */
export type ListSeries = (
  after: SeriesCursor | null,
) => ReturnType<typeof commands.librarySeries>;

/** The library's series, read a page at a time as far as the screen has needed them. */
export function librarySeriesList(
  listSeries: ListSeries,
): PagedList<LibrarySeries, SeriesCursor> {
  return new PagedList(async (after) => {
    const page = await listSeries(after);
    return page.status === "ok"
      ? {
          status: "ok",
          data: { items: page.data.series, next: page.data.next },
        }
      : page;
  });
}

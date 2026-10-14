import type { commands, LibrarySeries } from "#lib/ipc/bindings.ts";
import { PagedList } from "#lib/paging/paged-list.svelte.ts";

type SeriesCursor = NonNullable<Parameters<typeof commands.librarySeries>[0]>;

export type ListSeries = (
  after: SeriesCursor | null,
) => ReturnType<typeof commands.librarySeries>;

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

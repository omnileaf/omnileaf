import {
  commands,
  type HistoryEntry,
  type HistoryPage,
} from "#lib/ipc/bindings.ts";
import { PagedList } from "#lib/paging/paged-list.svelte.ts";

type HistoryCursor = NonNullable<HistoryPage["next"]>;

/** The reading sessions History lists, newest first, read a page at a time. */
export function historyList(): PagedList<HistoryEntry, HistoryCursor> {
  return new PagedList(async (after) => {
    const page = await commands.readingHistory(after);
    return page.status === "ok"
      ? {
          status: "ok",
          data: { items: page.data.entries, next: page.data.next },
        }
      : page;
  });
}

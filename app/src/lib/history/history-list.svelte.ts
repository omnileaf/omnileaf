import {
  commands,
  type HistoryEntry,
  type HistoryOf,
  type HistoryPage,
} from "#lib/ipc/bindings.ts";
import { type KeptPages, PagedList } from "#lib/paging/paged-list.svelte.ts";

type HistoryCursor = NonNullable<HistoryPage["next"]>;

export type KeptHistory = KeptPages<HistoryEntry, HistoryCursor>;

/** Reads the sessions `of` names as each page is read, so a list started again follows a new choice. */
export function historyList(
  of: () => HistoryOf,
  kept?: KeptHistory,
): PagedList<HistoryEntry, HistoryCursor> {
  return new PagedList(async (after) => {
    const page = await commands.readingHistory(after, of());
    return page.status === "ok"
      ? {
          status: "ok",
          data: { items: page.data.entries, next: page.data.next },
        }
      : page;
  }, kept);
}

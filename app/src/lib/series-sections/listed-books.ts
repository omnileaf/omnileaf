import type { SeriesBook } from "#lib/ipc/bindings.ts";
import type { ListState } from "#lib/paging/paged-list.svelte.ts";

export interface ListedBooks {
  readonly list: ListState<SeriesBook>;
  readonly loadMore: () => Promise<void>;
  readonly loadAll: () => Promise<void>;
}

import type { IpcError } from "#lib/ipc/bindings.ts";

/** One page of a list, and where the page after it starts, absent on the last page. */
export interface ListPage<Item, Cursor> {
  readonly items: readonly Item[];
  readonly next: Cursor | null;
}

export type PageResult<Item, Cursor> =
  | { readonly status: "ok"; readonly data: ListPage<Item, Cursor> }
  | { readonly status: "error"; readonly error: IpcError };

/** Reads the page after a cursor, or the first page without one. */
export type ReadPage<Item, Cursor> = (
  after: Cursor | null,
) => Promise<PageResult<Item, Cursor>>;

export type ListState<Item> =
  | { readonly kind: "loading" }
  | {
      readonly kind: "loaded";
      readonly items: readonly Item[];
      readonly isComplete: boolean;
    }
  | { readonly kind: "failed" };

type Read<Item, Cursor> =
  | {
      readonly kind: "read";
      readonly items: readonly Item[];
      readonly next: Cursor | null;
    }
  | { readonly kind: "failed" }
  | { readonly kind: "superseded" };

/** A list the core pages by cursor, read a page at a time as far as the screen has needed it. */
export class PagedList<Item, Cursor> {
  list: ListState<Item> = $state({ kind: "loading" });

  #latestLoad = 0;
  #listsBegun = 0;
  #next: Cursor | null = null;
  #loadingMore: Promise<void> | undefined;

  constructor(private readonly readPage: ReadPage<Item, Cursor>) {}

  /** Reads from the start as many items as the list shows, at least a page, and only the most recently started load shows its list. */
  async load(): Promise<void> {
    const shown = this.list.kind === "loaded" ? this.list.items.length : 0;
    await this.#loadAtLeast(shown);
  }

  /** Reads the first page of a new list, and only the most recently started load shows its list. */
  async start(): Promise<void> {
    this.#listsBegun += 1;
    await this.#loadAtLeast(0);
  }

  /** Reads the page after the last one shown, once at a time, until the list is complete, and drops it if another list was begun meanwhile. */
  loadMore(): Promise<void> {
    this.#loadingMore ??= this.#readMore().finally(() => {
      this.#loadingMore = undefined;
    });
    return this.#loadingMore;
  }

  /** Reads every page after the last one shown, a page at a time, until the list is complete or can't be read. */
  async loadAll(): Promise<void> {
    while (this.list.kind === "loaded" && this.#next !== null) {
      await this.loadMore();
    }
  }

  async #readMore(): Promise<void> {
    const after = this.#next;
    if (this.list.kind !== "loaded" || after === null) {
      return;
    }
    const shownList = this.#listsBegun;
    const shown = this.list.items;
    const page = await this.readPage(after);
    if (shownList !== this.#listsBegun) {
      return;
    }
    this.#show(
      page.status === "ok"
        ? {
            kind: "read",
            items: [...shown, ...page.data.items],
            next: page.data.next,
          }
        : { kind: "failed" },
    );
  }

  async #loadAtLeast(count: number): Promise<void> {
    const load = ++this.#latestLoad;
    const read = await this.#readFromStart(load, count);
    if (read.kind !== "superseded") {
      this.#show(read);
    }
  }

  async #readFromStart(
    load: number,
    atLeast: number,
  ): Promise<Read<Item, Cursor>> {
    const items: Item[] = [];
    let after: Cursor | null = null;
    do {
      const page: PageResult<Item, Cursor> = await this.readPage(after);
      if (load !== this.#latestLoad) {
        return { kind: "superseded" };
      }
      if (page.status === "error") {
        return { kind: "failed" };
      }
      items.push(...page.data.items);
      after = page.data.next;
    } while (after !== null && items.length < atLeast);
    return { kind: "read", items, next: after };
  }

  #show(read: Exclude<Read<Item, Cursor>, { kind: "superseded" }>): void {
    this.#listsBegun += 1;
    if (read.kind === "failed") {
      this.list = { kind: "failed" };
      return;
    }
    this.#next = read.next;
    this.list = {
      kind: "loaded",
      items: read.items,
      isComplete: read.next === null,
    };
  }
}

import type { IpcError } from "#lib/ipc/bindings.ts";

export interface ListPage<Item, Cursor> {
  readonly items: readonly Item[];
  readonly next: Cursor | null;
}

export type PageResult<Item, Cursor> =
  | { readonly status: "ok"; readonly data: ListPage<Item, Cursor> }
  | { readonly status: "error"; readonly error: IpcError };

export type ReadPage<Item, Cursor> = (
  after: Cursor | null,
) => Promise<PageResult<Item, Cursor>>;

export interface KeptPages<Item, Cursor> {
  readonly items: readonly Item[];
  readonly next: Cursor | null;
}

export type ListState<Item> =
  | { readonly kind: "loading" }
  | {
      readonly kind: "loaded";
      readonly items: readonly Item[];
      readonly isComplete: boolean;
    }
  | { readonly kind: "failed" };

interface PageEnd<Cursor> {
  readonly end: number;
  readonly next: Cursor | null;
}

type Read<Item, Cursor> =
  | {
      readonly kind: "read";
      readonly items: readonly Item[];
      readonly pageEnds: readonly PageEnd<Cursor>[];
    }
  | { readonly kind: "failed" }
  | { readonly kind: "superseded" };

export class PagedList<Item, Cursor> {
  list: ListState<Item> = $state({ kind: "loading" });

  #latestLoad = 0;
  #listsBegun = 0;
  #next: Cursor | null = null;
  #pageEnds: readonly PageEnd<Cursor>[] = [];
  #loadingMore:
    { readonly list: number; readonly read: Promise<void> } | undefined;

  constructor(
    private readonly readPage: ReadPage<Item, Cursor>,
    kept?: KeptPages<Item, Cursor>,
  ) {
    if (kept !== undefined) {
      this.#show({
        kind: "read",
        items: kept.items,
        pageEnds: [{ end: kept.items.length, next: kept.next }],
      });
    }
  }

  pagesThroughShown(itemsShown: number): KeptPages<Item, Cursor> | undefined {
    if (this.list.kind !== "loaded") {
      return undefined;
    }
    const ending =
      this.#pageEnds.find(({ end }) => end >= itemsShown) ??
      this.#pageEnds.at(-1);
    return ending === undefined
      ? undefined
      : { items: this.list.items.slice(0, ending.end), next: ending.next };
  }

  /** Reads from the start as many items as the list shows, at least a page, and only the most recently started load shows its list. */
  async load(): Promise<void> {
    const shown = this.list.kind === "loaded" ? this.list.items.length : 0;
    await this.#loadAtLeast(shown);
  }

  async start(): Promise<void> {
    this.#listsBegun += 1;
    this.#next = null;
    await this.#loadAtLeast(0);
  }

  /** Reads the page after the last one shown, once at a time, until the list is complete, and drops it if another list was begun meanwhile. */
  loadMore(): Promise<void> {
    const list = this.#listsBegun;
    if (this.#loadingMore?.list !== list) {
      const loading = {
        list,
        read: this.#readMore().finally(() => {
          if (this.#loadingMore === loading) {
            this.#loadingMore = undefined;
          }
        }),
      };
      this.#loadingMore = loading;
    }
    return this.#loadingMore.read;
  }

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
    if (page.status === "error") {
      this.#show({ kind: "failed" });
      return;
    }
    const items = [...shown, ...page.data.items];
    this.#show({
      kind: "read",
      items,
      pageEnds: [
        ...this.#pageEnds,
        { end: items.length, next: page.data.next },
      ],
    });
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
    const pageEnds: PageEnd<Cursor>[] = [];
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
      pageEnds.push({ end: items.length, next: after });
    } while (after !== null && items.length < atLeast);
    return { kind: "read", items, pageEnds };
  }

  #show(read: Exclude<Read<Item, Cursor>, { kind: "superseded" }>): void {
    this.#listsBegun += 1;
    if (read.kind === "failed") {
      this.list = { kind: "failed" };
      return;
    }
    const next = read.pageEnds.at(-1)?.next ?? null;
    this.#next = next;
    this.#pageEnds = read.pageEnds;
    this.list = {
      kind: "loaded",
      items: read.items,
      isComplete: next === null,
    };
  }
}

import type { commands, FolderPage, LibraryFolder } from "$lib/ipc/bindings";

export type ListFolders = typeof commands.libraryFolders;
export type RemoveFolder = typeof commands.removeLibraryFolder;
export type CountFolderBooks = typeof commands.libraryFolderBookCount;

export type FolderList =
  | { readonly kind: "loading" }
  | {
      readonly kind: "loaded";
      readonly home: LibraryFolder | undefined;
      readonly linked: readonly LibraryFolder[];
    }
  | { readonly kind: "failed" };

export type RemoveOutcome = "removed" | "failed";

/** The library's folders, read page by page until the backend says there are no more. */
export class LibraryFolders {
  list: FolderList = $state({ kind: "loading" });

  #latestLoad = 0;

  constructor(
    private readonly listFolders: ListFolders,
    private readonly removeFolder: RemoveFolder,
    private readonly countFolderBooks: CountFolderBooks,
  ) {}

  /** Only the most recently started load shows its list, so a slower older one can't bring back stale folders. */
  async load(): Promise<void> {
    const load = ++this.#latestLoad;
    const folders: LibraryFolder[] = [];
    let after: FolderPage["next"] = null;
    do {
      const page = await this.listFolders(after);
      if (page.status === "error") {
        this.#show(load, { kind: "failed" });
        return;
      }
      folders.push(...page.data.folders);
      after = page.data.next;
    } while (after !== null);
    this.#show(load, {
      kind: "loaded",
      home: folders.find((folder) => folder.kind === "home"),
      linked: folders.filter((folder) => folder.kind === "linked"),
    });
  }

  #show(load: number, list: FolderList): void {
    if (load === this.#latestLoad) {
      this.list = list;
    }
  }

  /** A folder something else already removed counts as removed, since the list then matches what was asked for. */
  async remove(folder: LibraryFolder): Promise<RemoveOutcome> {
    const result = await this.removeFolder(folder.id);
    if (result.status === "error" && result.error.code !== "folderNotFound") {
      return "failed";
    }
    await this.load();
    return "removed";
  }

  /** Leaves the count out when it couldn't be read, since it only adds detail to what the folder is. */
  async countBooks(folder: LibraryFolder): Promise<number | undefined> {
    const result = await this.countFolderBooks(folder.id);
    return result.status === "ok" ? result.data : undefined;
  }
}

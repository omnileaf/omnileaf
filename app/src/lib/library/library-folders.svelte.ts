import type { commands, FolderPage, LibraryFolder } from "#lib/ipc/bindings.ts";

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

export async function readFolderList(
  listFolders: ListFolders,
): Promise<FolderList> {
  const folders: LibraryFolder[] = [];
  let after: FolderPage["next"] = null;
  do {
    const page = await listFolders(after);
    if (page.status === "error") {
      return { kind: "failed" };
    }
    folders.push(...page.data.folders);
    after = page.data.next;
  } while (after !== null);
  return {
    kind: "loaded",
    home: folders.find((folder) => folder.kind === "home"),
    linked: folders.filter((folder) => folder.kind === "linked"),
  };
}

export class LibraryFolders {
  list: FolderList = $state({ kind: "loading" });

  #latestLoad = 0;

  constructor(
    private readonly listFolders: ListFolders,
    private readonly removeFolder: RemoveFolder,
    private readonly countFolderBooks: CountFolderBooks,
  ) {}

  async load(): Promise<void> {
    const load = ++this.#latestLoad;
    this.#show(load, await readFolderList(this.listFolders));
  }

  #show(load: number, list: FolderList): void {
    if (load === this.#latestLoad) {
      this.list = list;
    }
  }

  async remove(folder: LibraryFolder): Promise<RemoveOutcome> {
    const result = await this.removeFolder(folder.id);
    if (result.status === "error" && result.error.code !== "folderNotFound") {
      return "failed";
    }
    await this.load();
    return "removed";
  }

  async countBooks(folder: LibraryFolder): Promise<number | undefined> {
    const result = await this.countFolderBooks(folder.id);
    return result.status === "ok" ? result.data : undefined;
  }
}

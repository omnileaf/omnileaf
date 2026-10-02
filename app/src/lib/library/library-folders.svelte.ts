import type { commands, FolderPage, LibraryFolder } from "$lib/ipc/bindings";

export type ListFolders = typeof commands.libraryFolders;

export type FolderList =
  | { readonly kind: "loading" }
  | {
      readonly kind: "loaded";
      readonly home: LibraryFolder | undefined;
      readonly linked: readonly LibraryFolder[];
    }
  | { readonly kind: "failed" };

/** The library's folders, read page by page until the backend says there are no more. */
export class LibraryFolders {
  list: FolderList = $state({ kind: "loading" });

  constructor(private readonly listFolders: ListFolders) {}

  async load(): Promise<void> {
    const folders: LibraryFolder[] = [];
    let after: FolderPage["next"] = null;
    do {
      const page = await this.listFolders(after);
      if (page.status === "error") {
        this.list = { kind: "failed" };
        return;
      }
      folders.push(...page.data.folders);
      after = page.data.next;
    } while (after !== null);
    this.list = {
      kind: "loaded",
      home: folders.find((folder) => folder.kind === "home"),
      linked: folders.filter((folder) => folder.kind === "linked"),
    };
  }
}

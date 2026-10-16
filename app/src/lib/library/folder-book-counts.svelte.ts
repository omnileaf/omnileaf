import { SvelteMap } from "svelte/reactivity";

import type { LibraryFolder } from "#lib/ipc/bindings.ts";

export type CountBooksIn = (
  folder: LibraryFolder,
) => Promise<number | undefined>;

export class FolderBookCounts {
  readonly #counts = new SvelteMap<LibraryFolder["id"], number>();

  constructor(private readonly countBooksIn: CountBooksIn) {}

  of(folder: LibraryFolder): number | undefined {
    return this.#counts.get(folder.id);
  }

  async load(folders: readonly LibraryFolder[]): Promise<void> {
    await Promise.all(
      folders.map(async (folder) => {
        const books = await this.countBooksIn(folder);
        if (books !== undefined) {
          this.#counts.set(folder.id, books);
        }
      }),
    );
  }
}

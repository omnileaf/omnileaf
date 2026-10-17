import { SvelteMap } from "svelte/reactivity";

import type { LibraryFolder } from "#lib/ipc/bindings.ts";

export interface FolderSummary {
  readonly series: number;
  readonly books: number;
}

export type CountIn = (folder: LibraryFolder) => Promise<number | undefined>;

export class FolderSummaries {
  readonly #found = new SvelteMap<LibraryFolder["id"], FolderSummary>();

  constructor(
    private readonly countSeriesIn: CountIn,
    private readonly countBooksIn: CountIn,
  ) {}

  of(folder: LibraryFolder): FolderSummary | undefined {
    return this.#found.get(folder.id);
  }

  hasCounted(folders: readonly LibraryFolder[]): boolean {
    return folders.every((folder) => this.#found.has(folder.id));
  }

  total(folders: readonly LibraryFolder[]): FolderSummary {
    return folders
      .map((folder) => this.of(folder))
      .filter((summary) => summary !== undefined)
      .reduce(
        (sum, summary) => ({
          series: sum.series + summary.series,
          books: sum.books + summary.books,
        }),
        { series: 0, books: 0 },
      );
  }

  async load(folders: readonly LibraryFolder[]): Promise<void> {
    await Promise.all(
      folders.map(async (folder) => {
        const [series, books] = await Promise.all([
          this.countSeriesIn(folder),
          this.countBooksIn(folder),
        ]);
        if (series !== undefined && books !== undefined) {
          this.#found.set(folder.id, { series, books });
        }
      }),
    );
  }
}

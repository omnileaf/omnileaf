import { SvelteMap } from "svelte/reactivity";

import type {
  commands,
  LibraryFolder,
  RescanOutcome,
} from "#lib/ipc/bindings.ts";

import type { RescanFolder } from "./rescan-folder";
import { followScan, type ScanStep } from "./scan-step";

export type RemoveFolderBooks = typeof commands.removeBooksOfEmptiedFolder;

export type RescanStatus =
  | { readonly kind: "idle" }
  | (ScanStep & { readonly folder: LibraryFolder })
  | {
      readonly kind: "finished";
      readonly folder: LibraryFolder;
      readonly outcome: RescanOutcome;
    }
  | { readonly kind: "failed"; readonly folder: LibraryFolder }
  | { readonly kind: "removingBooks"; readonly folder: LibraryFolder };

/** What a folder a rescan found empty offers until it's rescanned again or its books are removed. */
export type EmptiedFolder = "foundEmpty" | "removalFailed";

/** The one folder rescan or removal of books Settings runs at a time, and the folders found empty. */
export class Rescans {
  status: RescanStatus = $state({ kind: "idle" });

  readonly #emptied = new SvelteMap<LibraryFolder["id"], EmptiedFolder>();

  constructor(
    private readonly rescanFolder: RescanFolder,
    private readonly removeFolderBooks: RemoveFolderBooks,
  ) {}

  get isBusy(): boolean {
    return (
      this.status.kind === "finding" ||
      this.status.kind === "reading" ||
      this.status.kind === "removingBooks"
    );
  }

  isRescanning(folder: LibraryFolder): boolean {
    return (
      this.isBusy &&
      this.status.kind !== "idle" &&
      this.status.folder.id === folder.id
    );
  }

  emptied(folder: LibraryFolder): EmptiedFolder | undefined {
    return this.#emptied.get(folder.id);
  }

  /** Resolves once the rescan is over, whatever it found. */
  async rescan(folder: LibraryFolder): Promise<void> {
    this.status = { kind: "finding", folder };
    const result = await this.rescanFolder(
      folder.id,
      followScan(
        () => this.isBusy,
        (step) => {
          this.status = { ...step, folder };
        },
      ),
    );
    if (result.status === "error") {
      this.status = { kind: "failed", folder };
      return;
    }
    const { outcome } = result.data;
    this.status = { kind: "finished", folder, outcome };
    if (outcome.kind === "foundEmpty") {
      this.#emptied.set(folder.id, "foundEmpty");
    } else {
      this.#emptied.delete(folder.id);
    }
  }

  /** Resolves to how many books went, or to nothing once they stayed and a rescan shows why, or the removal failed. */
  async removeBooks(folder: LibraryFolder): Promise<number | undefined> {
    this.status = { kind: "removingBooks", folder };
    const result = await this.removeFolderBooks(folder.id);
    if (result.status === "error") {
      this.#emptied.set(folder.id, "removalFailed");
      this.status = { kind: "idle" };
      return undefined;
    }
    if (result.data.kind === "kept") {
      await this.rescan(folder);
      return undefined;
    }
    this.#emptied.delete(folder.id);
    this.status = { kind: "idle" };
    return result.data.books;
  }
}

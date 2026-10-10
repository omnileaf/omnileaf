import type {
  commands,
  LibraryFolder,
  RescanOutcome,
} from "#lib/ipc/bindings.ts";

import type { RescanFolder } from "./rescan-folder";
import { followScan, type ScanStep } from "./scan-step";

export type RemoveFolderBooks = typeof commands.removeBooksOfEmptiedFolder;
export type PutBackFolderBooks = typeof commands.putBackRemovedBooks;

export type RescanStatus =
  | { readonly kind: "idle" }
  | (ScanStep & { readonly folder: LibraryFolder })
  | {
      readonly kind: "finished";
      readonly folder: LibraryFolder;
      readonly outcome: RescanOutcome;
    }
  | { readonly kind: "failed"; readonly folder: LibraryFolder }
  | {
      readonly kind: "removingBooks" | "removalFailed" | "putBackFailed";
      readonly folder: LibraryFolder;
    };

/** The one folder rescan Settings runs at a time, and what it found. */
export class Rescans {
  status: RescanStatus = $state({ kind: "idle" });

  constructor(
    private readonly rescanFolder: RescanFolder,
    private readonly removeFolderBooks: RemoveFolderBooks,
    private readonly putBackFolderBooks: PutBackFolderBooks,
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
    this.status =
      result.status === "ok"
        ? { kind: "finished", folder, outcome: result.data.outcome }
        : { kind: "failed", folder };
  }

  /** Resolves to how many books went, or to nothing once they stayed and a rescan shows why, or the removal failed. */
  async removeBooks(folder: LibraryFolder): Promise<number | undefined> {
    this.status = { kind: "removingBooks", folder };
    const result = await this.removeFolderBooks(folder.id);
    if (result.status === "error") {
      this.status = { kind: "removalFailed", folder };
      return undefined;
    }
    if (result.data.kind === "kept") {
      await this.rescan(folder);
      return undefined;
    }
    this.status = { kind: "idle" };
    return result.data.books;
  }

  /** Counts nothing kept for the folder, as when it holds books again, as failing to put them back. */
  async putBackBooks(folder: LibraryFolder): Promise<void> {
    const result = await this.putBackFolderBooks(folder.id);
    if (result.status === "error" || !result.data) {
      this.status = { kind: "putBackFailed", folder };
    }
  }
}

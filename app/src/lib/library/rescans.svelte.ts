import type {
  LibraryFolder,
  RescanOutcome,
  ScanProgress,
} from "$lib/ipc/bindings";

import type { RescanFolder } from "./rescan-folder";

export type RescanStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "finding"; readonly folder: LibraryFolder }
  | {
      readonly kind: "reading";
      readonly folder: LibraryFolder;
      readonly scanned: number;
      readonly total: number;
    }
  | {
      readonly kind: "finished";
      readonly folder: LibraryFolder;
      readonly outcome: RescanOutcome;
    }
  | { readonly kind: "failed"; readonly folder: LibraryFolder };

/** The one folder rescan Settings runs at a time, and what it found. */
export class Rescans {
  status: RescanStatus = $state({ kind: "idle" });

  constructor(private readonly rescanFolder: RescanFolder) {}

  get isBusy(): boolean {
    return this.status.kind === "finding" || this.status.kind === "reading";
  }

  /** Resolves once the rescan is over, whatever it found. */
  async rescan(folder: LibraryFolder): Promise<void> {
    this.status = { kind: "finding", folder };
    const result = await this.rescanFolder(folder.id, (progress) => {
      this.#show(folder, progress);
    });
    this.status =
      result.status === "ok"
        ? { kind: "finished", folder, outcome: result.data.outcome }
        : { kind: "failed", folder };
  }

  /** Progress can arrive after the result it led to, which must not turn back into a rescan in progress. */
  #show(folder: LibraryFolder, progress: ScanProgress): void {
    if (!this.isBusy) {
      return;
    }
    this.status =
      progress.stage === "finding"
        ? { kind: "finding", folder }
        : {
            kind: "reading",
            folder,
            scanned: progress.scanned,
            total: progress.total,
          };
  }
}

import type { LibraryFolder, RescanOutcome } from "#lib/ipc/bindings.ts";

import type { RescanFolder } from "./rescan-folder";
import { followScan, type ScanStep } from "./scan-step";

export type RescanStatus =
  | { readonly kind: "idle" }
  | (ScanStep & { readonly folder: LibraryFolder })
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
}

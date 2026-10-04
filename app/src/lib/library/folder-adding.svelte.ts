import type { FolderScan, IpcErrorCode } from "$lib/ipc/bindings";

import type { AddFolder } from "./add-folder";
import { followScan, type ScanStep } from "./scan-step";

export type FolderAddingOutcome =
  | { readonly kind: "idle" }
  | { readonly kind: "adding" }
  | ScanStep
  | { readonly kind: "scanned"; readonly scan: FolderScan }
  | { readonly kind: "failed"; readonly code: IpcErrorCode };

/** One folder being added at a time, shared by every button that adds one and the status that reports it. */
export class FolderAdding {
  outcome: FolderAddingOutcome = $state({ kind: "idle" });

  readonly #showProgress = followScan(
    () => this.isBusy,
    (step) => {
      this.outcome = step;
    },
  );

  constructor(
    private readonly addFolder: AddFolder,
    private readonly onFinished: () => void = () => undefined,
  ) {}

  get isBusy(): boolean {
    return (
      this.outcome.kind === "adding" ||
      this.outcome.kind === "finding" ||
      this.outcome.kind === "reading"
    );
  }

  async add(): Promise<void> {
    this.outcome = { kind: "adding" };
    const result = await this.addFolder(this.#showProgress);
    if (result.status === "error") {
      this.outcome = { kind: "failed", code: result.error.code };
    } else if (result.data === null) {
      this.outcome = { kind: "idle" };
      return;
    } else {
      this.outcome = { kind: "scanned", scan: result.data };
    }
    this.onFinished();
  }
}

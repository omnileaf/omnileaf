import type { commands, FolderSurvey, IpcErrorCode } from "$lib/ipc/bindings";

export type AddFolder = typeof commands.addLibraryFolder;

export type FolderOutcome =
  | { readonly kind: "idle" }
  | { readonly kind: "adding" }
  | { readonly kind: "found"; readonly survey: FolderSurvey }
  | { readonly kind: "failed"; readonly code: IpcErrorCode };

/** One Add a folder flow, shared by every button that starts it and the notice that reports it. */
export class FolderAdding {
  outcome: FolderOutcome = $state({ kind: "idle" });

  constructor(private readonly addFolder: AddFolder) {}

  get isAdding(): boolean {
    return this.outcome.kind === "adding";
  }

  async add(): Promise<void> {
    this.outcome = { kind: "adding" };
    const result = await this.addFolder();
    if (result.status === "error") {
      this.outcome = { kind: "failed", code: result.error.code };
    } else if (result.data === null) {
      this.outcome = { kind: "idle" };
    } else {
      this.outcome = { kind: "found", survey: result.data };
    }
  }

  dismiss(): void {
    this.outcome = { kind: "idle" };
  }
}

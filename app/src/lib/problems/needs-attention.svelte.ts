import { createContext } from "svelte";

import type { IpcError, MissingFolder, StorageUse } from "#lib/ipc/bindings.ts";

export type Problem =
  | { readonly kind: "missingFolder"; readonly missing: MissingFolder }
  | { readonly kind: "lowSpace"; readonly freeBytes: number };

type Answer<Value> =
  | { readonly status: "ok"; readonly data: Value }
  | { readonly status: "error"; readonly error: IpcError };

export interface ProblemSources {
  readonly missingFolders: () => Promise<Answer<MissingFolder[]>>;
  readonly storageUse: () => StorageUse | undefined;
}

export class NeedsAttention {
  #folderProblems: readonly Problem[] = $state.raw([]);
  #isShown = $state(false);

  constructor(
    private readonly sources: ProblemSources,
    private readonly onError: (error: IpcError) => void,
  ) {}

  get problems(): readonly Problem[] {
    const used = this.sources.storageUse();
    return used?.isLow === true
      ? [
          ...this.#folderProblems,
          { kind: "lowSpace", freeBytes: used.freeBytes },
        ]
      : this.#folderProblems;
  }

  get isShown(): boolean {
    return this.#isShown;
  }

  show(): void {
    this.#isShown = true;
  }

  hide(): void {
    this.#isShown = false;
  }

  async gather(): Promise<void> {
    const missing = await this.sources.missingFolders();
    if (missing.status === "error") {
      this.onError(missing.error);
      return;
    }
    this.#folderProblems = missing.data.map((folder) => ({
      kind: "missingFolder",
      missing: folder,
    }));
  }
}

export const [getNeedsAttention, setNeedsAttention] =
  createContext<NeedsAttention>();

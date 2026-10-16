import { createContext } from "svelte";

import type { IpcError, MissingFolder } from "#lib/ipc/bindings.ts";

export type Problem = {
  readonly kind: "missingFolder";
  readonly missing: MissingFolder;
};

type Answer<Value> =
  | { readonly status: "ok"; readonly data: Value }
  | { readonly status: "error"; readonly error: IpcError };

export interface ProblemSources {
  readonly missingFolders: () => Promise<Answer<MissingFolder[]>>;
}

export class NeedsAttention {
  #problems: readonly Problem[] = $state.raw([]);

  constructor(
    private readonly sources: ProblemSources,
    private readonly onError: (error: IpcError) => void,
  ) {}

  get problems(): readonly Problem[] {
    return this.#problems;
  }

  async gather(): Promise<void> {
    const missing = await this.sources.missingFolders();
    if (missing.status === "error") {
      this.onError(missing.error);
      return;
    }
    this.#problems = missing.data.map((folder) => ({
      kind: "missingFolder",
      missing: folder,
    }));
  }
}

export const [getNeedsAttention, setNeedsAttention] =
  createContext<NeedsAttention>();

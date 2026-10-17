import { createContext } from "svelte";

import type { commands, IpcError, StorageUse } from "#lib/ipc/bindings.ts";

export type StorageCommands = Pick<
  typeof commands,
  "checkStorage" | "clearCachedPages" | "clearCovers"
>;

export type CacheKind = "cachedPages" | "covers";

export class StorageCheck {
  #use: StorageUse | undefined = $state.raw();
  #clearing: CacheKind | undefined = $state();

  constructor(
    private readonly storage: StorageCommands,
    private readonly onError: (error: IpcError) => void,
  ) {}

  get use(): StorageUse | undefined {
    return this.#use;
  }

  get clearing(): CacheKind | undefined {
    return this.#clearing;
  }

  async check(): Promise<void> {
    const checked = await this.storage.checkStorage();
    if (checked.status === "error") {
      this.onError(checked.error);
      return;
    }
    this.#use = checked.data;
  }

  async clear(kind: CacheKind): Promise<void> {
    this.#clearing = kind;
    try {
      const cleared = await (kind === "cachedPages"
        ? this.storage.clearCachedPages()
        : this.storage.clearCovers());
      if (cleared.status === "error") {
        this.onError(cleared.error);
      }
      await this.check();
    } finally {
      this.#clearing = undefined;
    }
  }
}

export const [getStorageCheck, setStorageCheck] = createContext<StorageCheck>();

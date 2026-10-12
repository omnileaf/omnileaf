import type { IpcError } from "#lib/ipc/bindings.ts";

type Result<Data> =
  { status: "ok"; data: Data } | { status: "error"; error: IpcError };

export interface ChoiceStorage<Value> {
  readonly read: () => Promise<Result<Value>>;
  readonly store: (value: Value) => Promise<Result<null>>;
  readonly fallback: Value;
}

export type ChoiceReading<Value> =
  | { readonly kind: "reading" }
  | { readonly kind: "read"; readonly value: Value };

/** A choice this device keeps in the library's database, since the web view's storage may be wiped. */
export class StoredChoice<Value> {
  reading: ChoiceReading<Value> = $state({ kind: "reading" });

  #unstored: Value | undefined;
  #isStoring = false;

  constructor(
    private readonly storage: ChoiceStorage<Value>,
    private readonly onFailure: (error: IpcError) => void,
  ) {}

  /** Falls back when the stored choice can't be read, unless one was chosen meanwhile. */
  async load(): Promise<void> {
    const result = await this.storage.read();
    if (result.status === "error") {
      this.onFailure(result.error);
    }
    if (this.reading.kind === "reading") {
      this.reading = {
        kind: "read",
        value: result.status === "ok" ? result.data : this.storage.fallback,
      };
    }
  }

  /** Uses the choice at once and stores it after any store under way, so the one chosen last is the one kept. */
  choose(value: Value): void {
    this.reading = { kind: "read", value };
    this.#unstored = value;
    if (!this.#isStoring) {
      void this.#storeUntilKept();
    }
  }

  async #storeUntilKept(): Promise<void> {
    this.#isStoring = true;
    try {
      for (
        let value = this.#unstored;
        value !== undefined;
        value = this.#unstored
      ) {
        this.#unstored = undefined;
        const result = await this.storage.store(value);
        if (result.status === "error") {
          this.onFailure(result.error);
        }
      }
    } finally {
      this.#isStoring = false;
    }
  }
}

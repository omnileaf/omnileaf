import {
  type commands,
  DEFAULT_LIBRARY_VIEW,
  type IpcError,
  type LibraryView,
} from "$lib/ipc/bindings";

export type ReadLibraryView = typeof commands.libraryView;
export type StoreLibraryView = typeof commands.setLibraryView;

export type ViewReading =
  | { readonly kind: "reading" }
  | { readonly kind: "read"; readonly view: LibraryView };

/** How this device draws the library, kept in the library's database since the web view's storage may be wiped. */
export class LibraryViewSetting {
  reading: ViewReading = $state({ kind: "reading" });

  #unstored: LibraryView | undefined;
  #isStoring = false;

  constructor(
    private readonly read: ReadLibraryView,
    private readonly store: StoreLibraryView,
    private readonly onFailure: (error: IpcError) => void,
  ) {}

  /** Falls back to the view a new library starts with when the stored one can't be read, unless a view was chosen meanwhile. */
  async load(): Promise<void> {
    const result = await this.read();
    if (result.status === "error") {
      this.onFailure(result.error);
    }
    if (this.reading.kind === "reading") {
      this.reading = {
        kind: "read",
        view: result.status === "ok" ? result.data : DEFAULT_LIBRARY_VIEW,
      };
    }
  }

  /** Draws the view at once and stores it after any store under way, so the view chosen last is the one kept. */
  choose(view: LibraryView): void {
    this.reading = { kind: "read", view };
    this.#unstored = view;
    if (!this.#isStoring) {
      void this.#storeUntilKept();
    }
  }

  async #storeUntilKept(): Promise<void> {
    this.#isStoring = true;
    try {
      for (
        let view = this.#unstored;
        view !== undefined;
        view = this.#unstored
      ) {
        this.#unstored = undefined;
        const result = await this.store(view);
        if (result.status === "error") {
          this.onFailure(result.error);
        }
      }
    } finally {
      this.#isStoring = false;
    }
  }
}

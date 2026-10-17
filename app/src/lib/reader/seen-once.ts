import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const SEEN = "seen";

/** Something shown only until it has been seen once, remembered in the webview's storage. */
export class SeenOnce {
  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined, key: string) {
    this.#stored = new StoredPreference(store, key);
  }

  get isSeen(): boolean {
    return this.#stored.read() === SEEN;
  }

  see(): void {
    this.#stored.writeIfPossible(SEEN);
  }
}

export function seenOnce(key: string): SeenOnce {
  return new SeenOnce(browserPreferenceStore(), key);
}

export interface PreferenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** One choice kept in the web view's storage, which can refuse reads and writes, so a refusal reads as nothing stored. */
export class StoredPreference {
  constructor(
    private readonly store: PreferenceStore | undefined,
    private readonly key: string,
  ) {}

  read(): string | null {
    try {
      return this.store?.getItem(this.key) ?? null;
    } catch {
      return null;
    }
  }

  writeIfPossible(value: string): void {
    try {
      this.store?.setItem(this.key, value);
    } catch {
      return;
    }
  }
}

export function browserPreferenceStore(): PreferenceStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

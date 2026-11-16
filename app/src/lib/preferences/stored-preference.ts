export interface PreferenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ForgettingPreferenceStore extends PreferenceStore {
  removeItem(key: string): void;
}

/** The web view's storage can refuse reads and writes, so a refusal reads as nothing stored. */
export class StoredPreference<Store extends PreferenceStore = PreferenceStore> {
  constructor(
    private readonly store: Store | undefined,
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

  forgetIfPossible(this: StoredPreference<ForgettingPreferenceStore>): void {
    try {
      this.store?.removeItem(this.key);
    } catch {
      return;
    }
  }
}

export function browserPreferenceStore():
  ForgettingPreferenceStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

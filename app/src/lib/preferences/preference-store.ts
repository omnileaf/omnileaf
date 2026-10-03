export interface PreferenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Storage can be blocked or full, so a choice that can't be read or kept falls back to the default. */
export function readPreference(
  store: PreferenceStore | undefined,
  key: string,
): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function rememberPreference(
  store: PreferenceStore | undefined,
  key: string,
  value: string,
): void {
  try {
    store?.setItem(key, value);
  } catch {
    return;
  }
}

/** The web view's storage, kept until the app has a settings store. */
export function browserStorage(): PreferenceStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

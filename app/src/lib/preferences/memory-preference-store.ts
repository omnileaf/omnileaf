import type { PreferenceStore } from "./stored-preference.ts";

export function memoryPreferenceStore(): PreferenceStore {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
}

import type { ForgettingPreferenceStore } from "./stored-preference.ts";

export function memoryPreferenceStore(): ForgettingPreferenceStore {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value);
    },
    removeItem: (key) => {
      kept.delete(key);
    },
  };
}

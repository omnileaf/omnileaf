import { afterEach, expect, test, vi } from "vitest";

import { baseLocale } from "$lib/paraglide/runtime.js";

import {
  chooseLanguage,
  storedLanguageChoice,
  systemLanguage,
} from "./language";

const KEY = "omnileaf.language";

afterEach(() => {
  vi.restoreAllMocks();
});

function preferLanguages(languages: readonly string[]): void {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
}

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

test("follows the system when nothing is stored", () => {
  expect(storedLanguageChoice(memoryStore())).toBe("system");
});

test("reads back a stored language", () => {
  expect(storedLanguageChoice(memoryStore({ [KEY]: "en" }))).toBe("en");
});

test("follows the system when the stored language isn't one the app has", () => {
  expect(storedLanguageChoice(memoryStore({ [KEY]: "xx" }))).toBe("system");
});

test("choosing a language stores it and reloads", () => {
  const store = memoryStore();
  const reload = vi.fn();

  chooseLanguage("en", { store, reload });

  expect(store.values.get(KEY)).toBe("en");
  expect(reload).toHaveBeenCalledOnce();
});

test("choosing the system forgets the stored language and reloads", () => {
  const store = memoryStore({ [KEY]: "en" });
  const reload = vi.fn();

  chooseLanguage("system", { store, reload });

  expect(store.values.has(KEY)).toBe(false);
  expect(reload).toHaveBeenCalledOnce();
});

test("takes the system language from the device's preferred languages", () => {
  preferLanguages(["fr", "en-XA"]);

  expect(systemLanguage()).toBe("en-XA");
});

test("falls back to the app's base language when the device prefers none the app has", () => {
  preferLanguages(["xx", "yy-ZZ"]);

  expect(systemLanguage()).toBe(baseLocale);
});

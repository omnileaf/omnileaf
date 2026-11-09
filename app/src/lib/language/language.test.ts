import { afterEach, expect, test, vi } from "vitest";

import { baseLocale } from "#lib/paraglide/runtime.js";

import {
  rememberLanguageChoice,
  storedLanguageChoice,
  supportedLocaleForTag,
  systemAppLocale,
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

test("remembers a chosen language", () => {
  const store = memoryStore();

  rememberLanguageChoice("en", store);

  expect(store.values.get(KEY)).toBe("en");
});

test("choosing the system forgets the stored language", () => {
  const store = memoryStore({ [KEY]: "en" });

  rememberLanguageChoice("system", store);

  expect(store.values.has(KEY)).toBe(false);
});

test("takes the system language from the device's preferred languages", () => {
  preferLanguages(["fr", "en-XA"]);

  expect(systemLanguage()).toBe("en-XA");
});

test("falls back to the app's base language when the device prefers none the app has", () => {
  preferLanguages(["xx", "yy-ZZ"]);

  expect(systemLanguage()).toBe(baseLocale);
});

const SHIPPED = ["en", "de", "pt-BR"];

test("matches a system tag that is a shipped language exactly", () => {
  expect(supportedLocaleForTag("pt-BR", SHIPPED, "en")).toBe("pt-BR");
});

test("matches a region of a shipped language to the language", () => {
  expect(supportedLocaleForTag("de-AT", SHIPPED, "en")).toBe("de");
});

test("matches a script and region of a shipped language to the language", () => {
  expect(supportedLocaleForTag("de-Latn-CH", SHIPPED, "en")).toBe("de");
});

test("matches another region of a language shipped for one region to that region", () => {
  expect(supportedLocaleForTag("pt-PT", SHIPPED, "en")).toBe("pt-BR");
});

test("matches a tag whatever its case or separator", () => {
  expect(supportedLocaleForTag("PT_br", SHIPPED, "en")).toBe("pt-BR");
});

test("falls back to the default for a language the app isn't translated into", () => {
  expect(supportedLocaleForTag("ja-JP", SHIPPED, "en")).toBe("en");
});

test("offers no language of its own to a system that has chosen none", () => {
  expect(systemAppLocale(null)).toBeUndefined();
  expect(systemAppLocale("")).toBeUndefined();
});

test("never picks the pseudo locale for a system tag", () => {
  expect(systemAppLocale("en-XA")).toBe("en");
});

test("picks the default for a system language the app isn't translated into", () => {
  expect(systemAppLocale("ja")).toBe(baseLocale);
});

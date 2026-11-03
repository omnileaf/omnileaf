import { afterEach, expect, test, vi } from "vitest";

import { LanguageSetting } from "./language.svelte";

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

test("starts from the stored language", () => {
  const root = document.createElement("div");

  const setting = new LanguageSetting(memoryStore({ [KEY]: "en-XA" }), root);

  expect(setting.choice).toBe("en-XA");
  expect(setting.resolved).toBe("en-XA");
  expect(root.lang).toBe("en-XA");
  expect(root.dir).toBe("ltr");
});

test("follows the system when nothing is stored", () => {
  const root = document.createElement("div");

  const setting = new LanguageSetting(memoryStore(), root);

  expect(setting.choice).toBe("system");
  expect(setting.resolved).toBe("en");
  expect(root.lang).toBe("en");
});

test("choosing a language remembers it and shows it at once", () => {
  const store = memoryStore();
  const root = document.createElement("div");
  const setting = new LanguageSetting(store, root);

  setting.choose("en-XA");

  expect(store.values.get(KEY)).toBe("en-XA");
  expect(setting.choice).toBe("en-XA");
  expect(setting.resolved).toBe("en-XA");
  expect(root.lang).toBe("en-XA");
});

test("choosing the system forgets the stored language and shows the system's", () => {
  const store = memoryStore({ [KEY]: "en-XA" });
  const root = document.createElement("div");
  const setting = new LanguageSetting(store, root);

  setting.choose("system");

  expect(store.values.has(KEY)).toBe(false);
  expect(setting.choice).toBe("system");
  expect(setting.resolved).toBe("en");
  expect(root.lang).toBe("en");
});

test("keeps showing the same language when the choice resolves to it", () => {
  const root = document.createElement("div");
  const setting = new LanguageSetting(memoryStore(), root);

  setting.choose("en");

  expect(setting.choice).toBe("en");
  expect(setting.resolved).toBe("en");
  expect(root.lang).toBe("en");
});

test("shows the language the system's per-app setting names when the choice is the system", () => {
  preferLanguages(["en-XA"]);
  const root = document.createElement("div");
  const setting = new LanguageSetting(memoryStore(), root);
  expect(setting.resolved).toBe("en-XA");

  setting.followSystemApp("en-GB");

  expect(setting.choice).toBe("system");
  expect(setting.resolved).toBe("en");
  expect(root.lang).toBe("en");
});

test("goes back to the device's language when the system's per-app setting is cleared", () => {
  preferLanguages(["en-XA"]);
  const setting = new LanguageSetting(
    memoryStore(),
    document.createElement("div"),
  );
  setting.followSystemApp("en");

  setting.followSystemApp(null);

  expect(setting.resolved).toBe("en-XA");
});

test("keeps an explicit choice over the system's per-app setting", () => {
  const store = memoryStore({ [KEY]: "en-XA" });
  const root = document.createElement("div");
  const setting = new LanguageSetting(store, root);

  setting.followSystemApp("en");

  expect(setting.choice).toBe("en-XA");
  expect(setting.resolved).toBe("en-XA");
  expect(root.lang).toBe("en-XA");
  expect(store.values.get(KEY)).toBe("en-XA");
});

test("shows the system's per-app language again once the choice goes back to the system", () => {
  preferLanguages(["en-XA"]);
  const setting = new LanguageSetting(
    memoryStore({ [KEY]: "en-XA" }),
    document.createElement("div"),
  );
  setting.followSystemApp("en");

  setting.choose("system");

  expect(setting.resolved).toBe("en");
});

import { expect, test } from "vitest";

import { LanguageSetting } from "./language.svelte";

const KEY = "omnileaf.language";

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

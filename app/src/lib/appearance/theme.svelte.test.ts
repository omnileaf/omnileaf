import { expect, test } from "vitest";

import { ThemeSetting } from "./theme.svelte";

const PREFERENCE_KEY = "omnileaf.theme";

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function darkModeQuery(matches: boolean) {
  const listeners: (() => void)[] = [];
  return {
    matches,
    addEventListener: (_type: "change", listener: () => void) => {
      listeners.push(listener);
    },
    change(nowMatches: boolean) {
      this.matches = nowMatches;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

test("starts from the stored preference", () => {
  const root = document.createElement("div");

  const setting = new ThemeSetting(
    memoryStore({ [PREFERENCE_KEY]: "dark" }),
    darkModeQuery(false),
    root,
  );

  expect(setting.preference).toBe("dark");
  expect(root.dataset.theme).toBe("dark");
});

test("follows the system while the preference is system", () => {
  const root = document.createElement("div");
  const darkMode = darkModeQuery(false);
  new ThemeSetting(memoryStore(), darkMode, root);

  darkMode.change(true);

  expect(root.dataset.theme).toBe("dark");
});

test("keeps a chosen theme when the system changes", () => {
  const root = document.createElement("div");
  const darkMode = darkModeQuery(true);
  const setting = new ThemeSetting(memoryStore(), darkMode, root);

  setting.choose("light");
  darkMode.change(true);

  expect(root.dataset.theme).toBe("light");
});

test("remembers the chosen preference", () => {
  const store = memoryStore();
  const setting = new ThemeSetting(
    store,
    darkModeQuery(false),
    document.createElement("div"),
  );

  setting.choose("dark");

  expect(store.values.get(PREFERENCE_KEY)).toBe("dark");
});

test("still applies the theme when storage can't be read", () => {
  const root = document.createElement("div");
  const failingStore = {
    getItem: () => {
      throw new Error("storage is unavailable");
    },
    setItem: () => {
      throw new Error("storage is unavailable");
    },
  };

  const setting = new ThemeSetting(failingStore, darkModeQuery(true), root);
  setting.choose("light");

  expect(root.dataset.theme).toBe("light");
});

test("resolves to the system's theme while the preference is system", () => {
  const darkMode = darkModeQuery(false);
  const setting = new ThemeSetting(
    memoryStore(),
    darkMode,
    document.createElement("div"),
  );

  darkMode.change(true);

  expect(setting.resolved).toBe("dark");
});

test("resolves to a chosen theme whatever the system's", () => {
  const setting = new ThemeSetting(
    memoryStore(),
    darkModeQuery(true),
    document.createElement("div"),
  );

  setting.choose("light");

  expect(setting.resolved).toBe("light");
});

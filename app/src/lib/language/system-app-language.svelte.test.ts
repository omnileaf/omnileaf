import { expect, test } from "vitest";

import type { commands } from "#lib/ipc/bindings.ts";

import { LanguageSetting } from "./language.svelte";
import { followSystemAppLanguage } from "./system-app-language";

const KEY = "omnileaf.language";

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function settingOn(store = memoryStore()): LanguageSetting {
  return new LanguageSetting(store, document.createElement("div"));
}

function reading(offered: boolean, tag: string | null) {
  return (): ReturnType<typeof commands.systemAppLanguage> =>
    Promise.resolve({ status: "ok", data: { offered, tag } });
}

test("asks Android 13 for the language its settings name and hands it to the setting", async () => {
  const language = settingOn();

  await followSystemAppLanguage("android", language, reading(true, "en-GB"));

  expect(language.systemOffersLanguage).toBe(true);
  expect(language.resolved).toBe("en");
});

test("notes that Android before 13 offers no language of its own", async () => {
  const language = settingOn();

  await followSystemAppLanguage("android", language, reading(false, null));

  expect(language.systemOffersLanguage).toBe(false);
});

test("leaves an explicit choice alone whatever the system's settings name", async () => {
  const language = settingOn(memoryStore({ [KEY]: "en-XA" }));

  await followSystemAppLanguage("android", language, reading(true, "en"));

  expect(language.choice).toBe("en-XA");
  expect(language.resolved).toBe("en-XA");
});

test("changes nothing when Android can't say", async () => {
  const language = settingOn();

  await followSystemAppLanguage("android", language, () =>
    Promise.resolve({
      status: "error",
      error: { code: "internal", message: "timed out" },
    }),
  );

  expect(language.systemOffersLanguage).toBe(false);
});

test("doesn't ask anywhere but Android", async () => {
  const language = settingOn();
  let asked = false;

  for (const platform of ["ios", "linux", "macos", "windows"] as const) {
    await followSystemAppLanguage(platform, language, () => {
      asked = true;
      return reading(true, "en")();
    });
  }

  expect(asked).toBe(false);
});

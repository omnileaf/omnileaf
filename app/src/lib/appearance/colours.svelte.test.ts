import { expect, test } from "vitest";

import { ColoursSetting } from "./colours.svelte";

const PREFERENCE_KEY = "omnileaf.colours";

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

test("starts on Omnileaf's own colours", () => {
  const setting = new ColoursSetting(memoryStore());

  expect(setting.choice).toBe("omnileaf");
});

test("starts from the stored choice", () => {
  const setting = new ColoursSetting(
    memoryStore({ [PREFERENCE_KEY]: "wallpaper" }),
  );

  expect(setting.choice).toBe("wallpaper");
});

test("ignores a stored choice it does not know", () => {
  const setting = new ColoursSetting(memoryStore({ [PREFERENCE_KEY]: "neon" }));

  expect(setting.choice).toBe("omnileaf");
});

test("remembers a new choice", () => {
  const store = memoryStore();
  const setting = new ColoursSetting(store);

  setting.choose("wallpaper");

  expect([setting.choice, store.values.get(PREFERENCE_KEY)]).toEqual([
    "wallpaper",
    "wallpaper",
  ]);
});
